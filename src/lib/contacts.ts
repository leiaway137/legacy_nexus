import { Contact } from "./firebase/db";

export interface ParsedContact {
  firstName: string;
  lastName: string;
  middleName?: string;
  email: string;
  phone: string;
}

export function parseCSV(csvText: string): ParsedContact[] {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  
  // Find headers
  const headerLine = lines[0].toLowerCase();
  const headers = headerLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  
  let fnIdx = headers.findIndex(h => h.includes('first name') || h === 'first');
  let lnIdx = headers.findIndex(h => h.includes('last name') || h === 'last');
  let nameIdx = headers.findIndex(h => h === 'name' || h === 'full name');
  let emailIdx = headers.findIndex(h => h.includes('email') || h.includes('e-mail') || h.includes('e mail'));
  let phoneIdx = headers.findIndex(h => h.includes('phone') || h.includes('mobile'));

  const parsed: ParsedContact[] = [];

  for (let i = 1; i < lines.length; i++) {
     // Simple CSV row regex keeping quoted commas intact
     // Note: If fields are heavily nested, this could break, but standard Android/Apple CSVs are relatively clean
     const matchResult = lines[i].match(/(".*?"|[^",\n]*)(?=\s*,|\s*$)/g);
     if (!matchResult) continue;
     
     // Filter out the zero-length matches right before commas
     const row = matchResult.filter((m, idx, arr) => m !== "" || (idx > 0 && arr[idx-1] === "")).map(c => c.replace(/^"|"$/g, '').trim());

     let firstName = "";
     let lastName = "";
     let email = "";
     let phone = "";

     if (fnIdx !== -1 && row[fnIdx]) firstName = row[fnIdx];
     if (lnIdx !== -1 && row[lnIdx]) lastName = row[lnIdx];
     
     if (nameIdx !== -1 && !firstName && !lastName && row[nameIdx]) {
        const parts = row[nameIdx].split(' ');
        firstName = parts[0] || '';
        lastName = parts.slice(1).join(' ') || '';
     }
     
     if (emailIdx !== -1 && row[emailIdx]) email = row[emailIdx];
     if (phoneIdx !== -1 && row[phoneIdx]) phone = row[phoneIdx];

     if (firstName || lastName || email || phone) {
        parsed.push({ firstName, lastName, email, phone });
     }
  }
  return parsed;
}

export function parseVCF(vcfText: string): ParsedContact[] {
  const parsed: ParsedContact[] = [];
  // Some vCards have windows line endings
  const cleanVcf = vcfText.replace(/\r\n/g, '\n');
  const cards = cleanVcf.split(/BEGIN:VCARD/i).filter(c => c.trim().length > 0);
  
  for (const card of cards) {
     let firstName = "";
     let lastName = "";
     let email = "";
     let phone = "";

     // Extract 'FN:' (Formatted Name) or 'N:' (Name structure)
     const fnMatch = card.match(/^FN.*?:(.*)$/mi);
     if (fnMatch && fnMatch[1]) {
        const parts = fnMatch[1].trim().split(' ');
        firstName = parts[0] || '';
        lastName = parts.slice(1).join(' ') || '';
     } else {
        const nMatch = card.match(/^N.*?:(.*?);(.*?);/mi);
        if (nMatch) {
           lastName = (nMatch[1] || '').trim();
           firstName = (nMatch[2] || '').trim();
        }
     }

     const emailMatch = card.match(/^EMAIL.*?:(.*)$/mi);
     if (emailMatch && emailMatch[1]) email = emailMatch[1].trim();

     const phoneMatch = card.match(/^TEL.*?:(.*)$/mi);
     if (phoneMatch && phoneMatch[1]) phone = phoneMatch[1].trim();

     if (firstName || lastName || email || phone) {
        parsed.push({ firstName, lastName, email, phone });
     }
  }
  return parsed;
}

export function correlateContacts(userId: string, imported: ParsedContact[], existingDb: Contact[]): Contact[] {
    const output: Contact[] = [];
    const dbSnap = [...existingDb];

    for (const imp of imported) {
        const impFirst = imp.firstName.toLowerCase();
        const fullNameStr = (imp.firstName + " " + imp.lastName).trim().toLowerCase();
        
        let foundMatchIndex = -1;
        
        // 1. High Confidence: Email mapping
        if (imp.email && foundMatchIndex === -1) {
            foundMatchIndex = dbSnap.findIndex(c => c.email && c.email.toLowerCase() === imp.email.toLowerCase());
        }
        
        // 2. High Confidence: Full Name match
        if (foundMatchIndex === -1 && fullNameStr.length > 2) {
            foundMatchIndex = dbSnap.findIndex(c => {
               const cName = c.completeName.toLowerCase();
               const oName = c.originalName.toLowerCase();
               if (cName === fullNameStr || oName === fullNameStr) return true;
               if (c.aliases.some(a => a.toLowerCase() === fullNameStr)) return true;
               return false;
            });
        }
        
        // 3. Low Confidence (Fuzzy / Missing Last Name)
        // If the story extracted just "Peter" and the contact book imports "Peter Wayne", link them.
        if (foundMatchIndex === -1 && impFirst.length > 2) {
            foundMatchIndex = dbSnap.findIndex(c => {
                const cName = c.completeName.toLowerCase();
                const oName = c.originalName.toLowerCase();
                // If DB just has "Father", don't map to a random "Father Smith" imported contact incorrectly. Skip common labels.
                if (['father','mother','uncle','aunt','grandpa','grandma'].includes(oName)) return false;
                
                if (cName === impFirst || oName === impFirst) return true;
                if (c.aliases.some(a => a.toLowerCase() === impFirst)) return true;
                
                // If DB says "Peter Wayne" but import says "Peter"
                if (cName && (cName.includes(fullNameStr) || fullNameStr.includes(cName))) return true;
                
                return false;
            });
        }

        if (foundMatchIndex !== -1) {
            // MERGE MODE (Found mapping in Narrative Archive)
            const match = dbSnap[foundMatchIndex];
            match.email = match.email || imp.email;
            match.phone = match.phone || imp.phone;
            match.firstName = match.firstName || imp.firstName;
            match.lastName = match.lastName || imp.lastName;
            match.completeName = match.completeName || (imp.firstName + " " + imp.lastName).trim();
            // Upgrade source flag
            if (!match.source || match.source === 'story') {
                match.source = 'merged';
            }
            output.push(match);
            dbSnap.splice(foundMatchIndex, 1); // Mutate working set tracking
        } else {
            // ORPHAN MODE (Imported Contact not found in Stories)
            let newId = "import-" + Date.now().toString(36) + Math.random().toString(36).substring(2);
            if (typeof crypto !== 'undefined' && crypto.randomUUID) newId = crypto.randomUUID();
            
            output.push({
                id: newId,
                userId: userId,
                originalName: (imp.firstName + " " + imp.lastName).trim() || imp.email || "Unknown Contact",
                completeName: (imp.firstName + " " + imp.lastName).trim() || "",
                firstName: imp.firstName,
                lastName: imp.lastName,
                aliases: [],
                email: imp.email,
                phone: imp.phone,
                linkedAccountId: "",
                source: "import"
            });
        }
    }

    // append any unmerged db pieces back into output
    return [...output, ...dbSnap];
}

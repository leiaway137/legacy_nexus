const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

let modifiedCount = 0;

walkDir('./src', function(filePath) {
  if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
    const originalContent = fs.readFileSync(filePath, 'utf8');
    const newContent = originalContent.replace(/@\/lib\/firebase\/db/g, '@/lib/mongo/db');
    if (originalContent !== newContent) {
      fs.writeFileSync(filePath, newContent, 'utf8');
      modifiedCount++;
      console.log(`Updated: ${filePath}`);
    }
  }
});

console.log(`Total files modified: ${modifiedCount}`);

import os

def migrate_imports(directory):
    modified = 0
    for root, _, files in os.walk(directory):
        for file in files:
            if file.endswith('.ts') or file.endswith('.tsx'):
                filepath = os.path.join(root, file)
                with open(filepath, 'r') as f:
                    content = f.read()
                
                new_content = content.replace('@/lib/firebase/db', '@/lib/mongo/db')
                
                if new_content != content:
                    with open(filepath, 'w') as f:
                        f.write(new_content)
                    print(f"Updated: {filepath}")
                    modified += 1
    
    print(f"Total files modified: {modified}")

if __name__ == "__main__":
    migrate_imports('src')

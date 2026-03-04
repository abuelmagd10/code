const fs = require('fs');
const data = JSON.parse(fs.readFileSync('C:/Users/abuel/.gemini/antigravity/brain/dd4f8c87-fb3c-4aad-ab18-692749ac5afa/.system_generated/steps/6/output.txt', 'utf8'));
const table = data.tables.find(t => t.name === 'public.suppliers');
fs.writeFileSync('C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/supplier_columns.json', JSON.stringify(table.columns, null, 2));

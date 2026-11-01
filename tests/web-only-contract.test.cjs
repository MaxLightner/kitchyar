const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const root=join(__dirname,'..');

test('CI verifies the hybrid web app without assembling or publishing Android APKs',()=>{
 const workflow=readFileSync(join(root,'.github/workflows/verify.yml'),'utf8');
 assert.match(workflow,/npm run check/);
 assert.doesNotMatch(workflow,/assembleDebug|upload-artifact|kitchyar-ui-alpha-apk|apps\/android|gradle -p/);
 const contract=readFileSync(join(root,'docs/logic-contract.md'),'utf8');
 assert.match(contract,/وب‌اپ هیبرید/);
 const agentRules=readFileSync(join(root,'AGENTS.md'),'utf8');
 assert.match(agentRules,/docs\/logic-contract\.md/);
});

test('latest design contract governs joint optimization and agent edits',()=>{
 const contract=readFileSync(join(root,'docs/logic-contract.md'),'utf8');
 const agents=readFileSync(join(root,'AGENTS.md'),'utf8');
 assert.match(contract,/حل‌گر یکپارچه/);
 assert.match(contract,/۴۵ تا ۵۵ سانتی‌متر/);
 assert.match(contract,/موقعیت ترجیحی/);
 assert.match(contract,/تأیید/);
 assert.match(agents,/پیش از ویرایش گزارش بده/);
 assert.match(agents,/هیچ تغییری نده/);
});

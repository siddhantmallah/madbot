const fs = require("fs");
const { GoogleAuth } = require("google-auth-library");
const line = fs.readFileSync(".env.local","utf8").split(/\r?\n/).find(l=>l.startsWith("FIREBASE_SERVICE_ACCOUNT_B64="));
const c = JSON.parse(Buffer.from(line.split("=").slice(1).join("=").trim(),"base64").toString("utf8"));
(async () => {
  const auth = new GoogleAuth({ credentials: c, scopes: ["https://www.googleapis.com/auth/firebase"] });
  const client = await auth.getClient();
  const rel = await client.request({ url: `https://firebaserules.googleapis.com/v1/projects/${c.project_id}/releases/cloud.firestore` });
  const rs = await client.request({ url: `https://firebaserules.googleapis.com/v1/${rel.data.rulesetName}` });
  fs.writeFileSync(".tmp-deployed.rules", rs.data.source.files[0].content);
  console.log("ROLLBACK_RULESET=" + rel.data.rulesetName);
  console.log("saved deployed rules for diffing");
})().catch(e => { console.log("ERR", e.message); process.exit(1); });

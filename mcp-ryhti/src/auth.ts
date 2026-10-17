import http from "node:http";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createOAuthClient, SCOPES, CRED_DIR } from "./calendar.js";

const auth = createOAuthClient();
const url = auth.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: SCOPES });
console.log("Open this URL in your browser and sign in:\n\n" + url + "\n");

const server = http.createServer(async (req, res) => {
    const u = new URL(req.url!, "http://localhost:3333");
    if (u.pathname !== "/oauth2callback") return res.end();
    const code = u.searchParams.get("code");
    if (!code) return res.end("Missing code");

    const { tokens } = await auth.getToken(code);
    mkdirSync(CRED_DIR, { recursive: true });
    writeFileSync(path.join(CRED_DIR, "token.json"), JSON.stringify(tokens, null, 2));
    res.end("Authorised. You can close this tab.");
    console.log("Saved credentials/token.json");
    server.close();
});
server.listen(3333);
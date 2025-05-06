import fs from "fs";
import path from "path";
import { google } from "googleapis";

import open from "open";
import { Flow, JSONRPCResponse } from "flow-launcher-helper";
import { FlowParameters } from "flow-launcher-helper/lib/types";

const SCOPES = ["https://www.googleapis.com/auth/tasks.readonly"];
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

const TOKEN_PATH = path.join(__dirname, "token.json"); // Where the token will be stored

type Methods = "add_task" | "list_tasks" | "remove_task" | "help" | "debug";

interface Settings {
  username: string;
  api_token: string;
}

const { requestParams, on, showResult, run } = new Flow<Methods, Settings>(
  "Images\\app.png"
);

const commands = ["add", "remove", "list", "help", "debug"];

on("query", (params: FlowParameters) => {
  if (typeof params[0] !== "string") {
    showResult({
      title: "Google Tasks",
      subtitle: "Type a valid command",
      score: 100,
    });
    return;
  }

  const args = params[0].split(" ");
  const command = args[0];

  if (command.length === 0) {
    showResult({
      title: "Google Tasks",
      subtitle: "Valid commands are: " + commands.join(", "),
      score: 100,
    });
    return;
  }

  if (!commands.includes(command)) {
    showResult({
      title: "Google Tasks",
      subtitle: `Command ${command} not found`,
      score: 100,
    });
    return;
  }

  const results: JSONRPCResponse<Methods>[] = [];

  if (command === "add") {
    results.push({
      title: "Add task",
      subtitle: `Add task ${args.slice(1).join(" ")}`,
      method: "add_task",
      params: [args.slice(1).join(" ")],
      score: 100,
    });
  }

  if (command === "list") {
    results.push({
      title: "List tasks",
      subtitle: `List tasks`,
      method: "list_tasks",
      params: [],
      score: 100,
    });
  }

  results.push({
    title: "Debug Tasks:",
    subtitle: `Params: ${JSON.stringify(params)}, command ${command}`,
    score: 100,
  });

  showResult(...results);
});

on("list_tasks", (params) => {
  // Code to list tasks
});

run();

async function authorize() {
  const { OAuth2 } = google.auth;
  const oAuth2Client = new OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    "http://localhost:3000"
  );

  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  }

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });

  await open(authUrl); // Opens browser
  console.log("Authorize this app and paste the code from the browser...");

  // Start a simple local server to receive the token (or implement manual input)
  const code = await waitForCodeFromLocalhost(); // You'd implement this
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
  return oAuth2Client;
}

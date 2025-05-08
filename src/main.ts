import fs from "fs";
import path from "path";
import open from "open";
import childProcess from "child_process";

import { google } from "googleapis";
import { tasks_v1 } from "googleapis/build/src/apis/tasks/v1";

import { Flow, JSONRPCResponse } from "flow-launcher-helper";
import { FlowParameters } from "flow-launcher-helper/lib/types";

import dotenv from "dotenv";
import { getAuthenticatedClient, signOut } from "./auth.js";
dotenv.config();

// // Setup logging to file
const logFile = path.join(process.cwd(), "plugin.log");
const logStream = fs.createWriteStream(logFile, { flags: "a" });

// Redirect console.log and console.error to the file
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = function (...args) {
  const timestamp = new Date().toISOString();
  logStream.write(`[${timestamp}] INFO: ${args.join(" ")}\n`);
  originalConsoleLog.apply(console, args);
};

console.error = function (...args) {
  const timestamp = new Date().toISOString();
  logStream.write(`[${timestamp}] ERROR: ${args.join(" ")}\n`);
  originalConsoleError.apply(console, args);
};

const copy = (content: string) => childProcess.spawn("clip").stdin.end(content);

type Methods =
  | "add_task"
  | "list_tasks"
  | "remove_task"
  | "set_favorite"
  | "sign_out"
  | "help"
  | "debug";

interface Settings {
  favoriteListId: string | undefined;
}

const { on, showResult, run, settings } = new Flow<Methods, Settings>(
  "Images\\app.png"
);

const commands = [
  "add",
  "a",
  "remove",
  "list",
  "l",
  "lists",
  "logout",
  "help",
  "debug",
];

on("query", async (params: FlowParameters) => {
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
  const commandArgs = args.slice(1);
  const commandArgsString = commandArgs.join(" ");

  if (command.length === 0) {
    showResult({
      title: "Google Tasks",
      subtitle: "add, list, logout or help to view all commands",
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

  if (command === "add" || command === "a") {
    if (
      settings.favoriteListId === undefined ||
      settings.favoriteListId === ""
    ) {
      showResult({
        title: "Google Tasks",
        subtitle: "No favorite list set. Use 'tasks lists' to set one.",
        score: 100,
      });
      return;
    }

    const [title, ...dueDateParts] = commandArgsString.split(":");
    const dueDate = dueDateParts.join(":") || "";

    const parsedDueDate = parseDueDate(dueDate);
    const dueString = parsedDueDate
      ? new Date(parsedDueDate).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })
      : undefined;

    results.push({
      title: `Add task "${commandArgsString}"`,
      subtitle: `Add task at ${dueString ?? "no date"}`,
      method: "add_task",
      params: [title, dueDate, "", settings.favoriteListId],
      score: 100,
    });
  }

  if (command === "list" || command === "l") {
    const authClient = await getAuthenticatedClient();
    const tasksApi = google.tasks({ version: "v1", auth: authClient });

    // Fetch tasks from Google Tasks API

    const tasksRes = await tasksApi.tasks.list({
      tasklist: settings.favoriteListId,
    });

    const tasks = tasksRes.data.items ?? [];
    tasks.forEach((task: tasks_v1.Schema$Task) => {
      if (!task.completed) {
        results.push({
          title: task.title || "No title",
          subtitle: `Due: ${task.due}`,
          score: 100,
        });
      }
    });
  }

  if (command === "lists") {
    const authClient = await getAuthenticatedClient();
    const tasksApi = google.tasks({ version: "v1", auth: authClient });

    // Fetch tasks from Google Tasks API
    const res = await tasksApi.tasklists.list();
    const taskLists = res.data.items ?? [];

    // Add the task lists to the results
    taskLists.forEach((task) => {
      results.push({
        title: task.title || "No title",
        subtitle: `Press to copy list ID`,
        method: "set_favorite",
        params: [task.id ?? ""],
        score: 100,
      });
    });
  }

  if (command === "help") {
    results.push({
      title: "Google Tasks",
      subtitle: "Commands: add (a), list (l), lists, logout, help",
      score: 100,
    });
  }

  if (command === "debug") {
    const authClient = await getAuthenticatedClient();
    results.push({
      title: "Debug",
      subtitle: `Info: ${authClient.credentials.access_token}`,
      method: "debug",
      params: [],
      dontHideAfterAction: true,
      score: 100,
    });
  }

  if (command === "logout") {
    results.push({
      title: "Sign out",
      subtitle: `Sign out of Google Tasks, this will remove the stored token`,
      method: "sign_out",
      params: [],
      score: 100,
    });
  }

  // results.push({
  //   title: "Debug Tasks:",
  //   subtitle: `Params: ${JSON.stringify(params)}, command`,
  //   score: 0,
  // });

  showResult(...results);
});

on("list_tasks", async () => {
  // Make fake tasks for testing
  const tasks = [
    { id: "1", title: "Task 1" },
    { id: "2", title: "Task 2" },
    { id: "3", title: "Task 3" },
  ];
  const results: JSONRPCResponse<Methods>[] = tasks.map((task) => ({
    title: task.title,
    subtitle: `Task ID: ${task.id}`,
    method: "remove_task",
    params: [task.id],
    score: 100,
  }));

  showResult(...results);
});

on("set_favorite", async (params) => {
  // Copy the id to the clipboard
  copy(params[0] as string);
});

on("add_task", async (params) => {
  const title = params[0] as string;
  const dueDateInput = params[1] as string | undefined;
  const listId = params[3] as string;

  if (!title || title.length === 0 || !listId || listId.length === 0) {
    return;
  }

  const authClient = await getAuthenticatedClient();
  const tasksApi = google.tasks({ version: "v1", auth: authClient });

  // Create a new task
  const dueDate = parseDueDate(dueDateInput);

  const newTask: tasks_v1.Schema$Task = {
    title,
    due: dueDate ? new Date(dueDate).toISOString() : undefined,
    status: "needsAction",
  };

  try {
    await tasksApi.tasks.insert({
      tasklist: listId,
      requestBody: newTask,
    });
  } catch (error) {
    console.error("Error adding task:", error);
  }
});

on("sign_out", async () => {
  const res = await signOut();
});

on("debug", async (params) => {
  // try {
  //   // Don't log the entire auth client object as it can be very large
  //   console.log("Starting authentication debug process...");
  //   // Try to get an authenticated client
  const authClient = await getAuthenticatedClient();
  // console.log("Authenticated client:", JSON.stringify(authClient.credentials.access_token));
  open("http://localhost:3000/?test=" + authClient.credentials.access_token);
  // console.log("Authenticated client:", authClient);
  // } catch (error) {
  //   console.error("Error during authentication:", error);
  // }
});

function parseDueDate(dateString: string | undefined): string | undefined {
  if (!dateString) {
    return undefined;
  }

  // Check if the date string is a number
  if (!isNaN(Number(dateString))) {
    const daysToAdd = Number(dateString);
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysToAdd);
    return futureDate.toISOString();
  }

  // Check if the date string is in MM-DD format
  if (/^\d{2}-\d{2}$/.test(dateString)) {
    const [month, day] = dateString.split("-");
    let year = new Date().getFullYear();
    let date = new Date(`${year}-${month}-${day}`);

    // If the date has already passed this year, set the year to next year
    if (date.getTime() < new Date().getTime()) {
      year = year + 1;
      date = new Date(`${year}-${month}-${day}`);
    }
    return date.toISOString();
  }

  // Check if the date string is in MM-DD-HH:MM format
  if (/^\d{2}-\d{2}-\d{2}:\d{2}$/.test(dateString)) {
    const [month, day, time] = dateString.split("-");
    const [hours, minutes] = time.split(":");
    const year = new Date().getFullYear();
    const date = new Date(`${year}-${month}-${day}T${hours}:${minutes}:00`);
    return date.toISOString();
  }

  // If the date string is not in a valid format, return undefined
  return undefined;
}

run();

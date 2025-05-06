import open from "open";
import { Flow } from "flow-launcher-helper";

type Methods = "add_task" | "my_other_method";

interface Settings {
  username: string;
  api_token: string;
}

const { requestParams, on, showResult, run } = new Flow<Methods, Settings>(
  "Images\\app.png"
);

on("query", (params) => {
  showResult({
    title: "Add task",
    subtitle: `Add task ${params}`,
    method: "add_task",
    params: [`Add task ${params}`],
  });
});

on("add_task", (params) => {
  // Open the URL that was passed in params
  const url = params as unknown as string;
  try {
    open("https://www.google.com/search?q=" + encodeURIComponent(url));
  } catch (error) {
    showResult({
      title: "Error",
      subtitle: `Failed to open URL maps`,
    });
  }
});

run();

import fs from "fs";
import path from "path";
import http from "http";
import open from "open";
import destroyer from "server-destroy";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";

// Define authentication scopes
const SCOPES = ["https://www.googleapis.com/auth/tasks"];

// Token storage path
const TOKEN_PATH = path.join(".", "token.json");

/**
 * Create a new OAuth2 client with the configured keys
 */
function createOAuth2Client(port: number = 3000) {
  const client_id = process.env.GOOGLE_CLIENT_ID;
  const client_secret = process.env.GOOGLE_CLIENT_SECRET;
  const redirect_uri = `http://localhost:${port}/oauth2callback`;

  if (!client_id || !client_secret) {
    throw new Error(
      "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET environment variables"
    );
  }

  return new google.auth.OAuth2(client_id, client_secret, redirect_uri);
}

export async function getAuthenticatedClient(): Promise<OAuth2Client> {
  let server: http.Server | null = null;
  try {
    // Try to load the token from the file system
    let loadedToken;
    if (fs.existsSync(TOKEN_PATH)) {
      //console.log("Token file found, loading token...");
      const fileContent = fs.readFileSync(TOKEN_PATH, "utf-8");
      if (fileContent.trim() !== "") {
        loadedToken = JSON.parse(fileContent);
      } else {
        //console.log("Token file is empty, no token loaded.");
      }
    }

    // Check if we have stored token
    if (loadedToken) {
      //console.log("Tokens loaded:", loadedToken);
      const oauth2Client = createOAuth2Client();
      oauth2Client.setCredentials(loadedToken);
      return oauth2Client;
    } else {
      // Create a promise that will be resolved with the OAuth client
      const authClientPromise = new Promise<any>((resolve, reject) => {
        setupCallbackServer(async (client) => {
          try {
            resolve(client);
          } catch (error) {
            reject(error);
          }
        })
          .then((serverResult) => {
            server = serverResult.server;

            const oauth2Client = createOAuth2Client(serverResult.port);

            // Generate the authentication URL
            const authUrl = oauth2Client.generateAuthUrl({
              access_type: "offline",
              prompt: "consent", // Force consent screen to ensure refresh token is returned
              scope: SCOPES,
            });

            //console.log("Authorize this app by visiting:", authUrl);

            // Open browser to authenticate
            return open(authUrl);
          })
          .catch((error) => {
            reject(error);
          });
      });

      // Wait for authentication to complete
      return await authClientPromise;
    }
  } catch (error) {
    console.error("Error in authentication:", error);
    throw error;
  } finally {
    // Make absolutely sure we clean up the server
    if (server) {
      try {
        //console.log("Ensuring server is closed in finally block");

        // Use destroy instead of close for more aggressive shutdown
        if ((server as any).destroy) {
          (server as any).destroy();
          //console.log("Server destroyed");
        } else {
          //console.log("Server could not close");
        }
      } catch (err) {
        console.error("Error while closing server:", err);
      }
    }
  }
}

function setupCallbackServer(
  onSuccess: (code: any) => void
): Promise<{ port: number; server: http.Server }> {
  return new Promise((resolve, reject) => {
    // Add a timeout to prevent hanging
    const serverTimeout = setTimeout(() => {
      reject(new Error("Server setup timed out after 30 seconds"));
    }, 30000);

    const tryPort = (port: number) => {
      const server = http.createServer((req, res) => {
        try {
          const url = new URL(req.url || "", `http://localhost:${port}`);
          const code = url.searchParams.get("code");

          if (code) {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(`
            <html>
              <body>
                <h2>Authentication successful!</h2>
                <p>You can close this window now.</p>
                <script>setTimeout(() => { window.close(); }, 3000);</script>
              </body>
            </html>
          `);

            // Process the code with onSuccess callback
            process.nextTick(async () => {
              try {
                const oauth2Client = createOAuth2Client(port);

                // Get token and return the client
                const client = await getNewToken(oauth2Client, code);
                onSuccess(client);
              } catch (e) {
                console.error("Error in onSuccess callback:", e);
              }
            });
          } else {
            // Handle error case
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end(`
            <html>
              <body>
                <h2>Authentication failed</h2>
                <p>No authorization code received.</p>
              </body>
            </html>
          `);
          }
        } catch (error) {
          res.writeHead(500, { "Content-Type": "text/html" });
          res.end(
            `<html><body><h2>Server Error</h2><p>${error}</p></body></html>`
          );
          console.error("Server error:", error);
        }
      });

      // Apply server-destroy
      destroyer(server);

      // Handle server errors
      server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          //console.log(`Port ${port} is in use, trying port ${port + 1}...`);
          tryPort(port + 1);
        } else {
          clearTimeout(serverTimeout);
          reject(err);
        }
      });

      // Start listening
      server.listen(port, () => {
        //console.log(`Callback server listening on port ${port}`);
        clearTimeout(serverTimeout);
        resolve({ port, server });
      });
    };

    // Start with port 3000
    tryPort(3000);
  });
}

async function getNewToken(oauth2Client: any, code: string): Promise<any> {
  try {
    // Exchange code for tokens
    //console.log("Getting token with code");
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Store the token for future use
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    //console.log("Token stored to:", TOKEN_PATH);

    return oauth2Client;
  } catch (error) {
    console.error("Error getting token:", error);
    throw error;
  }
}

export async function signOut() {
  try {
    // Delete the token file
    if (fs.existsSync(TOKEN_PATH)) {
      fs.unlinkSync(TOKEN_PATH);
    } else {
      console.log("Token file does not exist.");
    }
  } catch (error) {
    console.error("Error deleting token:", error);
  }
}

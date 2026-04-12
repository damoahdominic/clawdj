module.exports = {
  apps: [
    {
      name: "clawdj-frontend",
      cwd: "./frontend",
      script: "node_modules/.bin/next",
      args: "start -p 3004",
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_API_URL: "http://localhost:8004",
      },
    },
    {
      name: "clawdj-backend",
      cwd: "./backend",
      interpreter: "/bin/bash",
      script: "../scripts/start-backend.sh",
    },
  ],
};

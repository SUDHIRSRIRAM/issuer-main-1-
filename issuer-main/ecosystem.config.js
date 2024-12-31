module.exports = {
  apps: [{
    name: "image-processor",
    script: "npm",
    args: "start",
    instances: "max",
    exec_mode: "cluster",
    watch: false,
    max_memory_restart: "1G",
    env: {
      NODE_ENV: "production"
    }
  }]
}

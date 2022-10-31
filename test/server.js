require('./environment')
/* istanbul ignore file */
async function main () {
  const app = await require('./app')
  app.listen(8081, '0.0.0.0', (err, addr) => {
    if (err) {
      console.error(`worker PID ${process.pid} error: ${err}`)
      process.exit(1)
    } else {
      console.log(`worker PID ${process.pid} listening on ${addr} ...`)
    }
  })
}

main()

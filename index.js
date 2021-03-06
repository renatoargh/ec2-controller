const express = require('express')
const bodyParser = require('body-parser')
const Aws = require('aws-sdk')

let {PORT, INSTANCE_IDS, AWS_ACCOUNT_NUMBER, AWS_BILLING_BUCKET} = process.env
INSTANCE_IDS = INSTANCE_IDS.split(',')

const ec2 = new Aws.EC2({apiVersion: '2014-10-01'})
const s3 = new Aws.S3({apiVersion: '2006-03-01'})

const app = express()
app.set('view engine', 'pug')
app.use(express.static('static'))
app.use(bodyParser.urlencoded({extended: false}))

app.get('/', (req, res) => {
  res.redirect('/instances')
})

const getMonthlyBill = (req, res, next) => {
  const now = new Date()
  const month = (now.getMonth() + 1).toString().padStart(2, '0')
  const year = now.getFullYear()

  s3.getObject({
    Bucket: AWS_BILLING_BUCKET,
    Key: `${AWS_ACCOUNT_NUMBER}-aws-billing-csv-${year}-${month}.csv`
  }, (err, data) => {
    if(err) {
      // Ignore errors getting billing info
      return next()
    }

    const {Body: body} = data
    const line = body.toString()
                      .split('\n')
                      .map(l => l.match(/"(.*?)"/g) || [])
                      .filter(l => l.includes('"StatementTotal"'))
                      .pop() || []

    req.billingTotal = (line.pop() || '').replace(/"/g, '')
    
    next()
  })
}

app.post('/instances/:instanceId/:action', async (req, res, next) => {
  const {instanceId, action} = req.params
  if (!INSTANCE_IDS.includes(instanceId)) {
    return next('Instance not found')
  }

  const ec2Action = {
    'start': 'startInstances',
    'stop': 'stopInstances'
  }[action]

  if (!ec2Action) {
    return next(new Error('Action not found'))
  }

  ec2[ec2Action]({
    InstanceIds: [instanceId]
  }, (err, data) => {
    if(err) {
      return next(err)
    }

    res.redirect('/instances')
  })
})

app.get('/instances', [
  getMonthlyBill
], async (req, res, next) => {
  ec2.describeInstances({
    InstanceIds: INSTANCE_IDS
  }, (err, data) => {
    if(err) {
      return next(err)
    }

    let instances = []
    data && data.Reservations && data.Reservations.forEach(r => instances.push(...r.Instances))

    instances = instances.map(instance => {
      const tag = instance.Tags.find(t => t.Key === 'Name')
      instance.Name = tag && tag.Value

      instance.StateIcon = {
        'pending': 'yellow-circle.ico',
        'running': 'green-circle.ico',
        'shutting-down': 'yellow-circle.ico',
        'terminated': 'red-circle.ico',
        'stopping': 'yellow-circle.ico',
        'stopped': 'red-circle.ico'
      }[instance.State.Name]

      instance.StateClass = {
        'pending': 'text-warning',
        'running': 'text-success',
        'shutting-down': 'text-warning',
        'terminated': 'text-danger',
        'stopping': 'text-warning',
        'stopped': 'text-danger'
      }[instance.State.Name]

      instance.NextAction = {
        'pending': null,
        'running': 'stop',
        'shutting-down': null,
        'terminated': null,
        'stopping': null,
        'stopped': 'start',
      }[instance.State.Name]

      instance.ActionClass = {
        'pending': null,
        'running': 'btn-danger',
        'shutting-down': null,
        'terminated': null,
        'stopping': null,
        'stopped': 'btn-success',
      }[instance.State.Name]

      return instance
    })

    const {billingTotal} = req
    res.render('instances', {instances, billingTotal})
  })
})

app.listen(PORT, () => {
  console.log(`ec2-controller lisntening on ${PORT}`)
})

const express = require('express')
const bodyParser = require('body-parser')
const Aws = require('aws-sdk')

let {PORT, INSTANCE_IDS, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION} = process.env
INSTANCE_IDS = INSTANCE_IDS.split(',')

const ec2 = new Aws.EC2({
  accessKeyId: AWS_ACCESS_KEY_ID,
  secretAccessLKey: AWS_SECRET_ACCESS_KEY,
  region: AWS_REGION,
  apiVersion: '2014-10-01'
})

const app = express()
app.set('view engine', 'pug')
app.use(bodyParser.urlencoded({extended: false}))

app.get('/', (req, res) => {
  res.redirect('/instances')
})

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

app.get('/instances', async (req, res, next) => {
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

    res.render('instances', {instances})
  })
})

app.listen(PORT, () => {
  console.log(`ec2-controller lisntening on ${PORT}`)
})
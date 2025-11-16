const { Physics: PhysicsNew, PlayerState: PlayerStateNew } = require('prismarine-physics/index')
const { Physics: PhysicsOld, PlayerState: PlayerStateOld } = require('prismarine-physics/indexold')
const { Vec3 } = require('vec3')
const mcData = require('minecraft-data')('1.8.9')
const Block = require('prismarine-block')('1.8.9')
const { performance } = require('perf_hooks')
const assert = require('node:assert')

const stoneBlock = new Block(mcData.blocksByName.stone.id, 0, 0)
const airBlock = new Block(mcData.blocksByName.air.id, 0, 0)

const fakeWorld = {
  getBlock: (pos) => {
    const b = (pos.y < 60) ? stoneBlock : airBlock
    b.position = pos
    return b
  }
}

function getPlayerState (pos) {
  return {
    entity: {
      position: pos,
      velocity: new Vec3(0, 0, 0),
      onGround: false,
      isInWater: false,
      isInLava: false,
      isInWeb: false,
      isCollidedHorizontally: false,
      isCollidedVertically: false,
      yawDegrees: 0,
      pitchDegrees: 0,
      yaw: 0,
      pitch: 0,
      effects: {}
    },
    jumpTicks: 0,
    jumpQueued: false,
    version: '1.8.9',
    inventory: {
      slots: []
    }
  }
}

const physOld = PhysicsOld(mcData, fakeWorld)
const physNew = PhysicsNew(mcData, fakeWorld)

const controls = {
  forward: true,
  back: false,
  left: false,
  right: false,
  jump: true,
  sprint: true,
  sneak: false
}

const controlChoices = Object.keys(controls)

const ticks = 2_500

const playerStateOld = new PlayerStateOld(getPlayerState(new Vec3(0, 65, 0)), controls)
const playerStateNew = new PlayerStateNew(getPlayerState(new Vec3(0, 65, 0)), controls)

for (let i = 0; i < ticks; i++) {
  if (Math.random() > 0.01) {
    const randomControlChange = controlChoices[Math.floor(Math.random() * controlChoices.length)]
    playerStateOld.control[randomControlChange] = !playerStateOld.control[randomControlChange]
    playerStateNew.control[randomControlChange] = !playerStateNew.control[randomControlChange]
  }
  if (Math.random() > 0.95) {
    const randomDYaw = (Math.random() * 0.4 - 0.2) * Math.PI / 2
    playerStateOld.yaw += randomDYaw
    playerStateNew.yaw += randomDYaw
  }
  if (Math.random() > 0.95) {
    const randomDPitch = (Math.random() * 0.4 - 0.2) * Math.PI / 2
    playerStateOld.pitch += randomDPitch
    playerStateNew.pitch += randomDPitch
  }
  physOld.simulatePlayer(playerStateOld, fakeWorld)
  physNew.simulatePlayer(playerStateNew, fakeWorld)
  const posOld = playerStateOld.pos
  const posNew = playerStateNew.pos
  assert(playerStateOld.yaw === playerStateNew.yaw, `Yaw mismatch at tick ${i}: old=${playerStateOld.yaw} new=${playerStateNew.yaw}`)
  assert(playerStateOld.pitch === playerStateNew.pitch, `Pitch mismatch at tick ${i}: old=${playerStateOld.pitch} new=${playerStateNew.pitch}`)
  assert(posOld.x.valueOf() === posNew.x.valueOf(), `X position mismatch at tick ${i}: old=${posOld.x.valueOf()} new=${posNew.x.valueOf()}`)
  assert(posOld.y.valueOf() === posNew.y.valueOf(), `Y position mismatch at tick ${i}: old=${posOld.y.valueOf()} new=${posNew.y.valueOf()}`)
  assert(posOld.z.valueOf() === posNew.z.valueOf(), `Z position mismatch at tick ${i}: old=${posOld.z.valueOf()} new=${posNew.z.valueOf()}`)
}

console.log(`Positions matched for ${ticks} ticks`)
console.log(`Final Position: X=${playerStateNew.pos.x.valueOf()} Y=${playerStateNew.pos.y.valueOf()} Z=${playerStateNew.pos.z.valueOf()}`)
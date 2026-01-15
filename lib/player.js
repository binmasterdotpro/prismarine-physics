// represents the current player state

const nbt = require('prismarine-nbt')
const mcData = require('minecraft-data')('1.21.5')
const { Vec3 } = require('vec3')
const { f32 } = require('./math')

class PlayerState {
  constructor (bot, control) {
    this.pos = bot.entity.position.clone()
    this.motion = bot.entity.velocity.clone()

    this.onGround = bot.entity.onGround
    this.isInWater = bot.entity.isInWater
    this.isInLava = bot.entity.isInLava
    this.isInWeb = bot.entity.isInWeb
    this.isCollidedHorizontally = bot.entity.isCollidedHorizontally
    this.isCollidedVertically = bot.entity.isCollidedVertically
    this.jumpTicks = bot.jumpTicks
    this.jumpQueued = bot.jumpQueued
    this.fireworkRocketDuration = bot.fireworkRocketDuration

    // Input only (not modified)
    this.attributes = bot.entity.attributes
    // both rotational values in degrees (notchian format). they should be float32 to replicate what the server should receive
    this.yawDegrees = typeof bot.entity.yawDegrees?.valueOf() === 'number' ? f32(bot.entity.yawDegrees) : f32((Math.PI - bot.entity.yaw) * RAD_TO_DEG)
    this.pitchDegrees = typeof bot.entity.pitchDegrees?.valueOf() === 'number' ? f32(bot.entity.pitchDegrees) : f32(-bot.entity.pitch * RAD_TO_DEG)

    this.control = control

    // effects
    const effects = bot.entity.effects
    this.jumpBoost = getEffectLevel(mcData, 'JumpBoost', effects)
    this.levitation = getEffectLevel(mcData, 'Levitation', effects)

    // armour enchantments
    const boots = bot.inventory.slots[8]
    if (boots && boots.nbt) {
      const simplifiedNbt = nbt.simplify(boots.nbt)
      const enchantments = simplifiedNbt.Enchantments ?? simplifiedNbt.ench ?? []
      const enchantmentsMap = boots?.componentMap?.get('enchantments')
      const strider = enchantmentsMap?.data?.enchantments?.find(({ id, level }) => id === 7)
      this.depthStrider = strider ? strider.level : getEnchantmentLevel(mcData, 'depth_strider', enchantments)
    } else {
      this.depthStrider = 0
    }
  }

  apply (bot) {
    bot.entity.position = new Vec3(
      this.pos.x.valueOf(),
      this.pos.y.valueOf(),
      this.pos.z.valueOf()
    )
    bot.entity.velocity = new Vec3(
      this.motion.x.valueOf(),
      this.motion.y.valueOf(),
      this.motion.z.valueOf()
    )
    bot.entity.onGround = this.onGround
    bot.entity.isInWater = this.isInWater
    bot.entity.isInLava = this.isInLava
    bot.entity.isInWeb = this.isInWeb
    bot.entity.isCollidedHorizontally = this.isCollidedHorizontally
    bot.entity.isCollidedVertically = this.isCollidedVertically
    bot.jumpTicks = this.jumpTicks
    bot.jumpQueued = this.jumpQueued
    bot.fireworkRocketDuration = this.fireworkRocketDuration
  }
}

// already accounts for the + 1
function getEffectLevel (mcData, effectName, effects) {
  const effectDescriptor = mcData.effectsByName[effectName]
  if (!effectDescriptor) {
    return 0
  }
  const effectInfo = effects[effectDescriptor.id]
  if (!effectInfo) {
    return 0
  }
  return effectInfo.amplifier + 1
}

function getEnchantmentLevel (mcData, enchantmentName, enchantments) {
  const enchantmentDescriptor = mcData.enchantmentsByName[enchantmentName]
  if (!enchantmentDescriptor) {
    return 0
  }

  for (const enchInfo of enchantments) {
    if (typeof enchInfo.id === 'string') {
      if (enchInfo.id.includes(enchantmentName)) {
        return enchInfo.lvl
      }
    } else if (enchInfo.id === enchantmentDescriptor.id) {
      return enchInfo.lvl
    }
  }
  return 0
}

module.exports = {
  PlayerState
}
// represents the current player state

const nbt = require('prismarine-nbt')
const mcData = require('minecraft-data')('1.21.5')
const { Vec3 } = require('vec3')
const { f32, f32add, f32div, f32mul } = require('./math')
const { CAN_SPRINT_VEHICLES, POSES, GAMEMODES, FLUID_TAGS, POSES_DIMENSIONS, EXTENDS_BOATS } = require('./constants')
const { Vec3I } = require('./vec')
const attribute = require('./attribute')


// todo: handle being frozen by powder (not sure if this is client side), spin attacks (dunno what they are)
// tick order: LivingEntity.tick() ->
// Entity.baseTick() (called at the very top): firstTick to false, this.updateInWaterStateAndDoFluidPushing(), this.updateFluidOnEyes(), this.updateSwimming(); ->
// LivingEntity.baseTick() (after Entity.baseTick() finishes): updateUsingItem ->
// LocalPlayer.aiStep() (called): --this.sprintTriggerTime, get abilities and perform some calculations with old abilities, set crouching, get new keyboard input, do autojump, handle moveTowardsClosestSpace, handle sprinting, handle flying, handle jump, handle fallfying, handle water, do flying setDeltaMovement, do riding, call Player.aiStep(), update abilities and flying ->
// Player.aiStep() (overriden): --this.jumpTriggerTime ->
// LivingEntity.aiStep() (called): getDeltaMovement (motion), zero any squared horizontal motion below 9.0E-6 and vertical below 3E-3, set the new motion, apply inputs (they will be overriden by player later), jumping logic (below var8.push("jump"), updateFallFlying, travel logic (simulate physics) -
// Player.travel(): some checks before passing back to LivingEntity.travel() ->
// LivingEntity.travel(): main movement logic (travelInFluid, travelFallFlying, travelInAir) ->
// LivingEntity.aiStep() (after travel): entity collisions (pushEntities) ->
// Player.aiStep() (after LivingEntity.aiStep()): set speed, pickup orbs ->
// LivingEntity.tick(): change some rotation visuals?, update fallFlyTicks, refresh dirty attribute (only seems to matter for MAX_HEALTH, MAX_ABSORPTION, SCALE)
class PlayerState {
  constructor (bot, world, control, oldControl) {
    this.world = world
    this.pos = bot.entity.position.clone()
    this.motion = bot.entity.velocity.clone()

    this.onGround = bot.entity.onGround
    this.isInWater = bot.entity.isInWater
    this.isInLava = bot.entity.isInLava
    this.isInWeb = bot.entity.isInWeb
    this.isCollidedHorizontally = bot.entity.isCollidedHorizontally
    this.isCollidedVertically = bot.entity.isCollidedVertically
    this.minorHorizontalCollision = bot.entity.minorHorizontalCollision ?? false
    this.jumpTicks = bot.jumpTicks
    this.jumpQueued = bot.jumpQueued
    this.fireworkRocketDuration = bot.fireworkRocketDuration
    // for double tap to sprint. this is non-toggleable in 1.21.5
    this.sprintTicks = bot.sprintTicks

    // Input only (not modified)
    this.attributes = bot.entity.attributes
    // both rotational values in degrees (notchian format). they should be float32 to replicate what the server should receive
    this.yawDegrees = typeof bot.entity.yawDegrees?.valueOf() === 'number' ? f32(bot.entity.yawDegrees) : f32((Math.PI - bot.entity.yaw) * RAD_TO_DEG)
    this.pitchDegrees = typeof bot.entity.pitchDegrees?.valueOf() === 'number' ? f32(bot.entity.pitchDegrees) : f32(-bot.entity.pitch * RAD_TO_DEG)

    this.oldInput = oldControl
    this.input = control

    // effects
    const effects = bot.entity.effects
    this.jumpBoost = getEffectLevel(mcData, 'JumpBoost', effects)
    this.levitation = getEffectLevel(mcData, 'Levitation', effects)
    this.slowFalling = getEffectLevel(mcData, 'SlowFalling', effects)
    this.blindness = getEffectLevel(mcData, 'Blindness', effects)

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

    this.food = bot.food
    // implement in fork
    // this.abilities = bot.abilities
    this.abilities = {
      mayfly: false,
      flying: false
    }
    this.gamemode = bot.gameMode

    // this.vehicleType = ...
    this.vehicleType = null
    // provide built-in useitem in fork
    this.usingItem = false

    this.oldPose = bot.entity.pose ?? POSES.STANDING
    this.oldSprinting = bot.entity.sprinting ?? false
    this.oldSneaking = bot.entity.sneaking ?? false
    this.oldFallFlying = bot.entity.fallFlying ?? false
    this.blockPosition = Vec3I.fromVec3(this.pos)
    // this.chunkPosition = new ChunkPos(this.blockPosition)

    // authoritative sprint and sneak
    this.sneaking = this.oldSneaking
    this.swimming = false
    this.fallFlying = this.oldFallFlying
    this.fluidOnEyes = new Set()
    this.updateFluidOnEyes()
    this.updateIsUnderwater()
    this.swimming = this.updateSwimming()
    this.sprinting = this.updateSprinting()
    this.crouching = this.oldSneaking
    this.movementInput = this.applyInput()
    this.entityDimensions = POSES_DIMENSIONS[this.oldPose]
  }

  updateSwimming() {
    if (this.abilities.flying) {
      return false
    } else {
      if (this.swimming) {
        return this.sprinting && this.isInWater && this.vehicleType === null
      } else {
        return this.sprinting && this.wasUnderWater && this.vehicleType === null && this.world.getFluidState(this.blockPosition).blockTags.WATER
      }
    }
  }

  // //       Vec3 var10 = new Vec3((double)this.xxa, (double)this.yya, (double)this.zza);
  //     // seems like yya is never set to non-zero value for localplayer
  //     // public void applyInput() {
  //     //   if (this.isControlledCamera()) {
  //     //     Vec2 var1 = this.modifyInput(this.input.getMoveVector());
  //     //     this.xxa = var1.x;
  //     //     this.zza = var1.y;
  //     //     this.jumping = this.input.keyPresses.jump();
  //     //     this.yBobO = this.yBob;
  //     //     this.xBobO = this.xBob;
  //     //     this.xBob += (this.getXRot() - this.xBob) * 0.5F;
  //     //     this.yBob += (this.getYRot() - this.yBob) * 0.5F;
  //     //   } else {
  //     //     super.applyInput();
  //     //   }
  //     //
  //     // }

  //    private static float calculateImpulse(boolean var0, boolean var1) {
  //       if (var0 == var1) {
  //          return 0.0F;
  //       } else {
  //          return var0 ? 1.0F : -1.0F;
  //       }
  //    }
  //
  //    public void tick() {
  //       this.keyPresses = new Input(this.options.keyUp.isDown(), this.options.keyDown.isDown(), this.options.keyLeft.isDown(), this.options.keyRight.isDown(), this.options.keyJump.isDown(), this.options.keyShift.isDown(), this.options.keySprint.isDown());
  //       float var1 = calculateImpulse(this.keyPresses.forward(), this.keyPresses.backward());
  //       float var2 = calculateImpulse(this.keyPresses.left(), this.keyPresses.right());
  //       this.moveVector = (new Vec2(var2, var1)).normalized();
  //    }

  calculateImpulse(pos, neg) {
    if (pos === neg) {
      return f32(0)
    }
    return pos ? f32(1) : f32(-1)
  }

  //    public Vec2 normalized() {
  //       float var1 = Mth.sqrt(this.x * this.x + this.y * this.y);
  //       return var1 < 1.0E-4F ? ZERO : new Vec2(this.x / var1, this.y / var1);
  //    }

  //    private Vec2 modifyInput(Vec2 var1) {
  //       if (var1.lengthSquared() == 0.0F) {
  //          return var1;
  //       } else {
  //          Vec2 var2 = var1.scale(0.98F);
  //          if (this.isUsingItem() && !this.isPassenger()) {
  //             var2 = var2.scale(0.2F);
  //          }
  //
  //          if (this.isMovingSlowly()) {
  //             float var3 = (float)this.getAttributeValue(Attributes.SNEAKING_SPEED);
  //             var2 = var2.scale(var3);
  //          }
  //
  //          return modifyInputSpeedForSquareMovement(var2);
  //       }
  //    }

  // private static Vec2 modifyInputSpeedForSquareMovement(Vec2 var0) {
  //       float var1 = var0.length();
  //       if (var1 <= 0.0F) {
  //          return var0;
  //       } else {
  //          Vec2 var2 = var0.scale(1.0F / var1);
  //          float var3 = distanceToUnitSquare(var2);
  //          float var4 = Math.min(var1 * var3, 1.0F);
  //          return var2.scale(var4);
  //       }
  //    }

  //    private static float distanceToUnitSquare(Vec2 var0) {
  //       float var1 = Math.abs(var0.x);
  //       float var2 = Math.abs(var0.y);
  //       float var3 = var2 > var1 ? var1 / var2 : var2 / var1;
  //       return Mth.sqrt(1.0F + Mth.square(var3));
  //    }

  // float
  distanceToUnitSquare(normX, normZ) {
    const absX = f32(Math.abs(normX))
    const absZ = f32(Math.abs(normZ))
    const ratio = absZ > absX ? f32div(absX, absZ) : f32div(absZ, absX)
    return f32(Math.sqrt(f32add(f32(1.0), f32mul(ratio, ratio))))
  }

  // vec2f
  modifyInputSpeedForSquareMovement(normX, normZ) {
    const length = f32(Math.sqrt(f32add(f32mul(normX, normX), f32mul(normZ, normZ))))
    if (length <= f32(0)) {
      return { x: normX, z: normZ }
    } else {
      const var2X = f32div(normX, length)
      const var2Z = f32div(normZ, length)
      const var3 = this.distanceToUnitSquare(var2X, var2Z)
      const var4 = f32add(f32mul(length, var3), f32(1.0))
      return {
        x: f32mul(var2X, var4),
        z: f32mul(var2Z, var4)
      }
    }
  }

  // double
  getSneakingSpeed() {
    const sneakingSpeedAttribute = this.attributes['sneaking_speed']
    if (sneakingSpeedAttribute === undefined) {
      return f32(0.3)
    }
    return f32(attribute.getAttributeValue(sneakingSpeedAttribute))
  }

  modifyInput(normX, normZ) {
    const lengthSquared = f32add(f32mul(normX, normX), f32mul(normZ, normZ))
    if (lengthSquared === f32(0)) {
      return { x: normX, z: normZ }
    }
    let modifiedX = f32mul(normX, f32(0.98))
    let modifiedZ = f32mul(normZ, f32(0.98))
    if (this.usingItem && this.vehicleType === null) {
      modifiedX = f32mul(modifiedX, f32(0.2))
      modifiedZ = f32mul(modifiedZ, f32(0.2))
    }
    if (this.isMovingSlowly()) {
      const sneakSpeed = this.getSneakingSpeed()
      modifiedX = f32mul(modifiedX, sneakSpeed)
      modifiedZ = f32mul(modifiedZ, sneakSpeed)
    }

    return this.modifyInputSpeedForSquareMovement(modifiedX, modifiedZ)
  }

  // returns the vec3 to be passed into input
  applyInput() {
    // note: this vec2 stores float
    const forward = this.calculateImpulse(this.input.forward, this.input.back)
    const strafe = this.calculateImpulse(this.input.right, this.input.left)
    const magnitude = f32(Math.sqrt(f32add(f32mul(forward, forward), f32mul(strafe, strafe))))
    const normX = magnitude < f32(1.0E-4) ? f32(0) : f32div(strafe, magnitude)
    const normZ = magnitude < f32(1.0E-4) ? f32(0) : f32div(forward, magnitude)
    return this.modifyInput(normX, normZ)
  }

  //       if (this.canStartSprinting()) {
  //          // double tap to sprint
  //          if (!goingForward) {
  //             if (this.sprintTriggerTime > 0) {
  //                this.setSprinting(true);
  //             } else {
  //                this.sprintTriggerTime = 7;
  //             }
  //          }
  //
  //          if (this.input.keyPresses.sprint()) {
  //             this.setSprinting(true);
  //          }
  //       }
  //
  //       if (this.isSprinting()) {
  //          if (this.isSwimming()) {
  //             if (this.shouldStopSwimSprinting()) {
  //                this.setSprinting(false);
  //             }
  //          } else if (this.shouldStopRunSprinting()) {
  //             this.setSprinting(false);
  //          }
  //       }

  // this is run after input.tick(), so based on new input!!!
  updateSprinting() {
    this.sprinting = this.oldSprinting
    if (this.canStartSprinting()) {
      if (!this.hasForwardImpulse(this.oldInput)) {
        if (this.sprintTicks > 0) {
          this.sprinting = true
        } else {
          this.sprintTicks = 7
        }
      }
    }

    if (this.sprinting) {
      if (this.isSwimming()) {
        if (this.shouldStopSwimSprinting()) {
          this.sprinting = false
        }
      } else if (this.shouldStopRunSprinting()) {
        this.sprinting = false
      }
    }

    return this.sprinting
  }

  canPlayerFitWithinBlocksAndEntitiesWhen(pose) {

  }

  // this is ran before input.tick(), so it's based on old input!!!
  updateCrouching() {
    //       this.crouching = !var4.flying && !this.isSwimming() && !this.isPassenger() && this.canPlayerFitWithinBlocksAndEntitiesWhen(Pose.CROUCHING) && (this.isShiftKeyDown() || !this.isSleeping() && !this.canPlayerFitWithinBlocksAndEntitiesWhen(Pose.STANDING));
    return !this.abilities.flying && !this.isSwimming() && this.vehicleType === null && this.canPlayerFitWithinBlocksAndEntitiesWhen(POSES.CROUCHING) && (this.input.sneak || !this.canPlayerFitWithinBlocksAndEntitiesWhen(POSES.STANDING));
  }


  // private boolean shouldStopSwimSprinting() {
  //   return this.hasBlindness() || this.isPassenger() && !this.vehicleCanSprint(this.getVehicle()) || !this.isInWater() || !this.input.hasForwardImpulse() && !this.onGround() && !this.input.keyPresses.shift() || !this.hasEnoughFoodToSprint();
  // }

  shouldStopSwimSprinting() {
    return this.blindness > 0 || (this.vehicleType !== null && !CAN_SPRINT_VEHICLES.has(this.vehicleType)) || !this.isInWater || !this.hasForwardImpulse(this.input) && !this.onGround && !this.input.sneak || !this.hasEnoughFoodToSprint();
  }

  // private boolean shouldStopRunSprinting() {
  //   return this.hasBlindness() || this.isPassenger() && !this.vehicleCanSprint(this.getVehicle()) || !this.input.hasForwardImpulse() || !this.hasEnoughFoodToSprint() || this.horizontalCollision && !this.minorHorizontalCollision || this.isInWater() && !this.isUnderWater();
  // }

  shouldStopRunSprinting() {
    return this.blindness > 0 || (this.vehicleType !== null && !CAN_SPRINT_VEHICLES.has(this.vehicleType)) || !this.hasForwardImpulse(this.input) || !this.hasEnoughFoodToSprint() || this.isCollidedHorizontally && !this.minorHorizontalCollision || this.isInWater && !this.wasUnderWater;
  }

  // protected void updatePlayerPose() {
  //   if (this.canPlayerFitWithinBlocksAndEntitiesWhen(Pose.SWIMMING)) {
  //     Pose var1 = this.getDesiredPose();
  //     Pose var2;
  //     if (!this.isSpectator() && !this.isPassenger() && !this.canPlayerFitWithinBlocksAndEntitiesWhen(var1)) {
  //       if (this.canPlayerFitWithinBlocksAndEntitiesWhen(Pose.CROUCHING)) {
  //         var2 = Pose.CROUCHING;
  //       } else {
  //         var2 = Pose.SWIMMING;
  //       }
  //     } else {
  //       var2 = var1;
  //     }
  //
  //     this.setPose(var2);
  //   }
  // }

  // private void updateFluidOnEyes() {
  //       this.wasEyeInWater = this.isEyeInFluid(FluidTags.WATER);
  //       this.fluidOnEyes.clear();
  //       double var1 = this.getEyeY();
  //       Entity var3 = this.getVehicle();
  //       if (var3 instanceof AbstractBoat var4) {
  //          if (!var4.isUnderWater() && var4.getBoundingBox().maxY >= var1 && var4.getBoundingBox().minY <= var1) {
  //             return;
  //          }
  //       }
  //
  //       BlockPos var8 = BlockPos.containing(this.getX(), var1, this.getZ());
  //       FluidState var5 = this.level().getFluidState(var8);
  //       double var6 = (double)((float)var8.getY() + var5.getHeight(this.level(), var8));
  //       if (var6 > var1) {
  //          Stream var10000 = var5.getTags();
  //          Set var10001 = this.fluidOnEyes;
  //          Objects.requireNonNull(var10001);
  //          var10000.forEach(var10001::add);
  //       }
  //
  //    }
  //    public double getEyeY() {
  //       return this.position.y + (double)this.eyeHeight;
  //    }
  // this.eyeHeight is set from EntityDimensions info

  // only for water??
  updateFluidOnEyes() {
    // this.wasEyeInWater = this.isEyeInFluid(FLUID_TAGS.WATER);
    this.fluidOnEyes.clear();
    // fp: dbl + (dbl)flt
    const eyeY = this.pos.y + this.entityDimensions.eyeHeight
    // const vehicle = this.vehicleType
    // if (EXTENDS_BOATS.has(vehicle)) {
    //   // todo: !vehicle.isUnderWater()
    //   if (vehicle.boundingBox.maxY >= eyeY && vehicle.boundingBox.minY <= eyeY) {
    //     return
    //   }
    // }

    const blockPos = Vec3I.fromVec3(new Vec3(this.pos.x, eyeY, this.pos.z))
    const fluidState = this.world.getFluidState(blockPos)
    const fluidHeight = f32add(f32(blockPos.y), f32div(fluidState._properties.level, f32(9.0)))
    if (fluidHeight > eyeY) {
      if (fluidState.blockTags.WATER) {
        this.fluidOnEyes.add(FLUID_TAGS.WATER)
      }
      if (fluidState.blockTags.LAVA) {
        this.fluidOnEyes.add(FLUID_TAGS.LAVA)
      }
    }
  }

  isEyeInFluid(fluidTag) {
    return this.fluidOnEyes.has(fluidTag)
  }

  // ran before super.tick() and thus the physics simulation
  updateIsUnderwater() {
    this.wasUnderWater = this.isEyeInFluid(FLUID_TAGS.WATER);
    return this.wasUnderWater;
  }

  //    protected boolean canPlayerFitWithinBlocksAndEntitiesWhen(Pose var1) {
  //       return this.level().noCollision(this, this.getDimensions(var1).makeBoundingBox(this.position()).deflate(1.0E-7));
  //    }

  //    private Pose getDesiredPose() {
  //       if (this.isSleeping()) {
  //          return Pose.SLEEPING;
  //       } else if (this.isSwimming()) {
  //          return Pose.SWIMMING;
  //       } else if (this.isFallFlying()) {
  //          return Pose.FALL_FLYING;
  //       } else if (this.isAutoSpinAttack()) {
  //          return Pose.SPIN_ATTACK;
  //       } else {
  //          return this.isShiftKeyDown() && !this.abilities.flying ? Pose.CROUCHING : Pose.STANDING;
  //       }
  //    }

  // run after the tick, so after physics simulation
  updatePlayerPose() {
    if (this.canPlayerFitWithinBlocksAndEntitiesWhen(POSES.SWIMMING)) {
      const desiredPose = this.getDesiredPose()
      let newPose
      if (!this.isSpectator() && !this.isPassenger() && !this.canPlayerFitWithinBlocksAndEntitiesWhen(desiredPose)) {
        if (this.canPlayerFitWithinBlocksAndEntitiesWhen(POSES.CROUCHING)) {
          newPose = POSES.CROUCHING
        } else {
          newPose = POSES.SWIMMING
        }
      } else {
        newPose = desiredPose
      }

      this.pose = newPose
    }
  }

  isSwimming() {
    return !this.abilities.flying && !this.gamemode !== GAMEMODES.SPECTATOR && this.swimming;
  }

  hasForwardImpulse(input) {
    return input.forward && !input.back
  }

  hasEnoughFoodToSprint() {
    //       return this.isPassenger() || (float)this.getFoodData().getFoodLevel() > 6.0F || this.getAbilities().mayfly;
    const foodLevel = this.food
    return this.vehicleType !== null || foodLevel > 6 || this.abilities.mayfly
  }

  isVisuallyCrawling() {
    return this.oldPose === POSES.SWIMMING && !this.isInWater
  }

  isMovingSlowly() {
    return this.crouching || this.isVisuallyCrawling()
  }

  canStartSprinting() {
    return !this.oldSprinting && this.hasForwardImpulse(this.input) && this.hasEnoughFoodToSprint() && !this.usingItem && this.blindness === 0 && (this.vehicleType === null || CAN_SPRINT_VEHICLES.has(this.vehicleType)) && (!this.oldFallFlying() || this.wasUnderWater) && (!this.isMovingSlowly() || this.wasUnderWater) && (!this.isInWater || this.wasUnderWater);
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

// warn: already accounts for the + 1 to amplifier
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
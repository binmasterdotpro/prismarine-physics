// represents the current player state

const nbt = require('prismarine-nbt')
const mcData = require('minecraft-data')('1.21.5')
const { Vec3 } = require('vec3')
const { f32, f32add, f32div } = require('./math')
const { CAN_SPRINT_VEHICLES, POSES, GAMEMODES, FLUID_TAGS, POSES_DIMENSIONS, EXTENDS_BOATS } = require('./constants')
const { Vec3I } = require('./vec')

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
    this.sprinting = this.oldSprinting
    this.sneaking = this.oldSneaking
    this.swimming = false
    this.fallFlying = this.oldFallFlying
    this.fluidOnEyes = new Set()
    this.updateFluidOnEyes()
    this.updateIsUnderwater()
    this.updateSwimming()
    this.updateSprinting()
    this.movementInput = this.calculateInput()
    this.entityDimensions = POSES_DIMENSIONS[this.oldPose]
  }

  //
  updateSwimming() {
    //          int var7 = Mth.floor(var1);
    //          int var8 = Mth.floor(var3);
    //          int var9 = Mth.floor(var5);
    //          if (var7 != this.blockPosition.getX() || var8 != this.blockPosition.getY() || var9 != this.blockPosition.getZ()) {
    //             this.blockPosition = new BlockPos(var7, var8, var9);
    //             this.inBlockState = null;
    //             if (SectionPos.blockToSectionCoord(var7) != this.chunkPosition.x || SectionPos.blockToSectionCoord(var9) != this.chunkPosition.z) {
    //                this.chunkPosition = new ChunkPos(this.blockPosition);
    //             }
    //          }
    if (this.swimming) {
      this.swimming = this.sprinting && this.isInWater && this.vehicleType === null
    } else {
      this.swimming = this.sprinting && this.wasUnderWater && this.vehicleType === null && this.world.getFluidState(this.blockPosition).blockTags.WATER
    }
  }

  // returns the vec3 to be passed into input
  calculateInput() {

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
  updateSprinting() {
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
    const fluidHeight = f32add(f32(blockPos.y), f32div(fluidState._properties.level, f32(9.0))
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
    return this.input.sneak || this.isVisuallyCrawling()
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
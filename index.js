const Vec3 = require('vec3').Vec3
const AABB = require('./lib/aabb')
const math = require('./lib/math')
const features = require('./lib/features')
const attribute = require('./lib/attribute')
const nbt = require('prismarine-nbt')

function makeSupportFeature(mcData) {
    return feature => features.some(({
                                         name,
                                         versions
                                     }) => name === feature && versions.includes(mcData.version.majorVersion))
}

// optional: toggling f32 for less precision but more java-like behavior (still not very accurate)
// const f32 = Math.fround
const f32 = (x) => x

const SIN_TABLE = new Array(65536);
const DEG_TO_RAD = Math.PI / 180.0;

for (let i = 0; i < 65536; i++)
{
    SIN_TABLE[i] = Math.sin(Math.fround(i * Math.PI * 2.0 / 65536.0));
}

function sin32(x) {
    return SIN_TABLE[Math.floor(x * 10430.378) & 65535];
}

function cos32(x) {
    return SIN_TABLE[(Math.floor(x * 10430.378) + 16384) & 65535];
}

function Physics(mcData, world) {
    const supportFeature = makeSupportFeature(mcData)
    const blocksByName = mcData.blocksByName

    const physics = {
        yawSpeed: 60.0,
        pitchSpeed: 30.0,
        // this.motionY -= 0.08D;, EntityLivingBase.java
        gravity: 0.08,
        // this.motionY *= 0.9800000190734863D;, EntityLivingBase.java. 32 bit equivalent of 0.98
        airdrag: 0.9800000190734863,
        // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/player/EntityPlayer.java#L163C5-L164C40
        playerSpeed: Math.fround(0.1),
        airborneAcceleration: Math.fround(0.02),
        // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/EntityLivingBase.java#L1610
        airborneInertia: 0.91,
        sprintSpeed: 0.3,
        // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/util/MovementInputFromOptions.java#L42C1-L46C10
        sneakSpeed: 0.3,
        // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/EntityLivingBase.java#L1974
        negligeableVelocity: 0.005,
        negligeableFlyingSpeed: f32(1.0E-4),
        // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/EntityLivingBase.java#L208
        stepHeight: f32(0.6), // how much height can the bot step on without jump
        ladderMaxSpeed: f32(0.15),
        // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/EntityLivingBase.java#L1594
        liquidMotionY: 0.03999999910593033,
        jumpMotionY: Math.fround(0.42),
        ladderClimbSpeed: 0.2,
        playerHalfWidth: f32(0.3),
        playerHeight: f32(1.8),
        waterInertia: Math.fround(0.8),
        lavaInertia: 0.5,
        baseLiquidAcceleration: Math.fround(0.02),
        // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/block/Block.java#L291
        defaultSlipperiness: 0.6,
        outOfLiquidImpulse: 0.3,
        autojumpCooldown: 10, // ticks (0.5s)
        bubbleColumnSurfaceDrag: {
            down: 0.03,
            maxDown: -0.9,
            up: 0.1,
            maxUp: 1.8
        },
        bubbleColumnDrag: {
            down: 0.03,
            maxDown: -0.3,
            up: 0.06,
            maxUp: 0.7
        },
        movementSpeedAttribute: mcData.attributesByName.movementSpeed.resource,
        sprintingUUID: '662a6b8d-da3e-4c1c-8813-96ea6097278d',
        // default slipperiness * friction
        magicFriction: 0.546,
        magicFrictionCubed: 0.162771336
    }
    const waterIds = [blocksByName.water.id, blocksByName.flowing_water ? blocksByName.flowing_water.id : -1]
    const lavaIds = [blocksByName.lava.id, blocksByName.flowing_lava ? blocksByName.flowing_lava.id : -1]
    const liquidIds = waterIds.concat(lavaIds)
    const blockSlipperiness = {}
    const slimeBlockId = blocksByName.slime_block ? blocksByName.slime_block.id : blocksByName.slime.id
    blockSlipperiness[slimeBlockId] = 0.8
    blockSlipperiness[blocksByName.ice.id] = 0.98
    blockSlipperiness[blocksByName.packed_ice.id] = 0.98
    if (blocksByName.frosted_ice) { // 1.9+
        blockSlipperiness[blocksByName.frosted_ice.id] = 0.98
    }
    if (blocksByName.blue_ice) { // 1.13+
        blockSlipperiness[blocksByName.blue_ice.id] = 0.989
    }
    const soulsandId = blocksByName.soul_sand.id
    const honeyblockId = blocksByName.honey_block ? blocksByName.honey_block.id : -1 // 1.15+
    const webId = blocksByName.cobweb ? blocksByName.cobweb.id : blocksByName.web.id
    const ladderId = blocksByName.ladder.id
    const vineId = blocksByName.vine.id
    const bubblecolumnId = blocksByName.bubble_column ? blocksByName.bubble_column.id : -1 // 1.13+

    if (supportFeature('independentLiquidGravity')) {
        physics.waterGravity = 0.02
        physics.lavaGravity = 0.02
    } else if (supportFeature('proportionalLiquidGravity')) {
        physics.waterGravity = physics.gravity / 16
        physics.lavaGravity = physics.gravity / 4
    } else {
        throw new Error('No liquid gravity settings, have you made sure the liquid gravity features are up to date?')
    }

    function getPlayerBB(pos) {
        const w = physics.playerHalfWidth
        return new AABB(-w, 0, -w, w, physics.playerHeight, w).offset(pos.x, pos.y, pos.z)
    }

    function resetPositionToBB(bb, pos) {
        pos.x = (bb.minX + bb.maxX) / 2.0
        pos.y = bb.minY
        pos.z = (bb.minZ + bb.maxZ) / 2.0
    }

    function getSurroundingBBs(world, queryBB) {
        const surroundingBBs = []
        const cursor = new Vec3(0, 0, 0)
        for (cursor.y = Math.floor(queryBB.minY) - 1; cursor.y <= Math.floor(queryBB.maxY); cursor.y++) {
            for (cursor.z = Math.floor(queryBB.minZ); cursor.z <= Math.floor(queryBB.maxZ); cursor.z++) {
                for (cursor.x = Math.floor(queryBB.minX); cursor.x <= Math.floor(queryBB.maxX); cursor.x++) {
                    const block = world.getBlock(cursor)
                    if (block) {
                        const blockPos = block.position
                        for (const shape of block.shapes) {
                            const blockBB = new AABB(shape[0], shape[1], shape[2], shape[3], shape[4], shape[5])
                            blockBB.offset(blockPos.x, blockPos.y, blockPos.z)
                            surroundingBBs.push(blockBB)
                        }
                    }
                }
            }
        }
        return surroundingBBs
    }

    // run one tick of player simulation
    physics.simulatePlayer = (playerState, world) => {
        const {motion, pos} = playerState
        if (playerState.jumpTicks > 0) playerState.jumpTicks--

        const waterBB = getPlayerBB(pos).contract(0.001, 0.401, 0.001)
        const lavaBB = getPlayerBB(pos).contract(0.1, 0.4, 0.1)

        //     public boolean handleWaterMovement()
        //     {
        //         if (this.worldObj.handleMaterialAcceleration(this.getEntityBoundingBox().expand(0.0D, -0.4000000059604645D, 0.0D).contract(0.001D, 0.001D, 0.001D), Material.water, this))
        //         {
        //             if (!this.inWater && !this.firstUpdate)
        //             {
        //                 this.resetHeight();
        //             }
        //
        //             this.fallDistance = 0.0F;
        //             this.inWater = true;
        //             this.fire = 0;
        //         }
        //         else
        //         {
        //             this.inWater = false;
        //         }
        //
        //         return this.inWater;
        //     }


        /**
         * Returns if this entity is in water and will end up adding the waters velocity to the entity
         */
        playerState.isInWater = isInWaterApplyCurrent(world, waterBB, motion)
        //     public boolean isInLava()
        //     {
        //         return this.worldObj.isMaterialInBB(this.getEntityBoundingBox().expand(-0.10000000149011612D, -0.4000000059604645D, -0.10000000149011612D), Material.lava);
        //     }
        playerState.isInLava = isMaterialInBB(world, lavaBB, lavaIds)

        // Reset velocity component if it falls under the threshold
        if (Math.abs(motion.x) < physics.negligeableVelocity) motion.x = 0
        if (Math.abs(motion.y) < physics.negligeableVelocity) motion.y = 0
        if (Math.abs(motion.z) < physics.negligeableVelocity) motion.z = 0

        // Handle inputs
        if (playerState.control.jump || playerState.jumpQueued) {
            // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/EntityLivingBase.java#L1589
            if (playerState.isInWater || playerState.isInLava) {
                motion.y += physics.liquidMotionY
            } else if (playerState.onGround && playerState.jumpTicks === 0) {
                motion.y = physics.jumpMotionY
                if (playerState.jumpBoost > 0) {
                    motion.y += f32(playerState.jumpBoost) * f32(0.1)
                }
                if (playerState.control.sprint) {
                    // notchian yaw is inverted
                    const notchianYaw = f32(playerState.yawDegrees * DEG_TO_RAD)
                    motion.x -= sin32(notchianYaw) * f32(0.2)
                    motion.z += sin32(notchianYaw) * f32(0.2)
                }
                playerState.jumpTicks = physics.autojumpCooldown
            }
        } else {
            playerState.jumpTicks = 0 // reset autojump cooldown
        }
        playerState.jumpQueued = false

        // both these fields should be float32!
        //         this.moveStrafing *= 0.98F;
        //         this.moveForward *= 0.98F;
        // movestrafing and moveforward are in range [-1.0, 1.0], already stored as F32
        let moveStrafing = f32(f32(playerState.control.right - playerState.control.left) * f32(0.98))
        let moveForward = f32(f32(playerState.control.forward - playerState.control.back) * f32(0.98))

        if (playerState.control.sneak) {
            moveStrafing *= physics.sneakSpeed
            moveForward *= physics.sneakSpeed
        }

        moveEntityWithHeading(playerState, world, moveStrafing, moveForward)

        return playerState
    }

    physics.adjustPositionHeight = (pos) => {
        const playerBB = getPlayerBB(pos)
        const queryBB = playerBB.clone().extend(0, -1, 0)
        const surroundingBBs = getSurroundingBBs(world, queryBB)

        let dy = -1
        for (const blockBB of surroundingBBs) {
            dy = blockBB.computeOffsetY(playerBB, dy)
        }
        pos.y += dy
    }

    function moveEntity(playerState, world, dx, dy, dz) {
        const {motion, pos} = playerState

        // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/Entity.java#L612
        if (playerState.isInWeb) {
            playerState.isInWeb = false
            dx *= 0.25
            dy *= 0.05
            dz *= 0.25
            motion.x = 0
            motion.y = 0
            motion.z = 0
        }

        let oldVelX = dx
        let oldVelY = dy
        let oldVelZ = dz

        const validSneak = playerState.control.sneak && playerState.onGround

        if (validSneak) {
            const step = 0.05

            // In the 3 loops bellow, y offset should be -1, but that doesnt reproduce vanilla behavior.
            for (; dx !== 0 && getSurroundingBBs(world, getPlayerBB(pos).offset(dx, 0, 0)).length === 0; oldVelX = dx) {
                if (dx < step && dx >= -step) dx = 0
                else if (dx > 0) dx -= step
                else dx += step
            }

            for (; dz !== 0 && getSurroundingBBs(world, getPlayerBB(pos).offset(0, 0, dz)).length === 0; oldVelZ = dz) {
                if (dz < step && dz >= -step) dz = 0
                else if (dz > 0) dz -= step
                else dz += step
            }

            while (dx !== 0 && dz !== 0 && getSurroundingBBs(world, getPlayerBB(pos).offset(dx, 0, dz)).length === 0) {
                if (dx < step && dx >= -step) dx = 0
                else if (dx > 0) dx -= step
                else dx += step

                if (dz < step && dz >= -step) dz = 0
                else if (dz > 0) dz -= step
                else dz += step

                oldVelX = dx
                oldVelZ = dz
            }
        }

        let playerBB = getPlayerBB(pos)
        const queryBB = playerBB.clone().extend(dx, dy, dz)
        const surroundingBBs = getSurroundingBBs(world, queryBB)
        const oldBB = playerBB.clone()

        for (const blockBB of surroundingBBs) {
            dy = blockBB.computeOffsetY(playerBB, dy)
        }

        playerBB.offset(0, dy, 0)

        for (const blockBB of surroundingBBs) {
            dx = blockBB.computeOffsetX(playerBB, dx)
        }
        playerBB.offset(dx, 0, 0)

        for (const blockBB of surroundingBBs) {
            dz = blockBB.computeOffsetZ(playerBB, dz)
        }

        playerBB.offset(0, 0, dz)

        const onGroundFlag = (playerState.onGround || (dy !== oldVelY && oldVelY < 0))
        // Step on block if height < stepHeight
        if (physics.stepHeight > 0 && onGroundFlag && (dx !== oldVelX || dz !== oldVelZ)) {
            const oldVelXCol = dx
            const oldVelYCol = dy
            const oldVelZCol = dz
            const oldBBCol = playerBB.clone()
            dy = physics.stepHeight

            const queryBB = oldBB.clone().extend(oldVelX, dy, oldVelZ)
            const surroundingBBs = getSurroundingBBs(world, queryBB)

            const BB1 = oldBB.clone()
            const BB2 = oldBB.clone()
            const BB_XZ = BB1.clone().extend(dx, 0, dz)

            let dy1 = dy
            let dy2 = dy
            for (const blockBB of surroundingBBs) {
                dy1 = blockBB.computeOffsetY(BB_XZ, dy1)
                dy2 = blockBB.computeOffsetY(BB2, dy2)
            }
            BB1.offset(0, dy1, 0)
            BB2.offset(0, dy2, 0)

            let dx1 = oldVelX
            let dx2 = oldVelX
            for (const blockBB of surroundingBBs) {
                dx1 = blockBB.computeOffsetX(BB1, dx1)
                dx2 = blockBB.computeOffsetX(BB2, dx2)
            }
            BB1.offset(dx1, 0, 0)
            BB2.offset(dx2, 0, 0)

            let dz1 = oldVelZ
            let dz2 = oldVelZ
            for (const blockBB of surroundingBBs) {
                dz1 = blockBB.computeOffsetZ(BB1, dz1)
                dz2 = blockBB.computeOffsetZ(BB2, dz2)
            }
            BB1.offset(0, 0, dz1)
            BB2.offset(0, 0, dz2)

            const norm1 = dx1 * dx1 + dz1 * dz1
            const norm2 = dx2 * dx2 + dz2 * dz2

            if (norm1 > norm2) {
                dx = dx1
                dy = -dy1
                dz = dz1
                playerBB = BB1
            } else {
                dx = dx2
                dy = -dy2
                dz = dz2
                playerBB = BB2
            }

            for (const blockBB of surroundingBBs) {
                dy = blockBB.computeOffsetY(playerBB, dy)
            }
            playerBB.offset(0, dy, 0)

            if (oldVelXCol * oldVelXCol + oldVelZCol * oldVelZCol >= dx * dx + dz * dz) {
                dx = oldVelXCol
                dy = oldVelYCol
                dz = oldVelZCol
                playerBB = oldBBCol
            }
        }

        // Update position (finally!)
        resetPositionToBB(playerBB, pos)

        playerState.isCollidedHorizontally = dx !== oldVelX || dz !== oldVelZ
        playerState.isCollidedVertically = dy !== oldVelY
        playerState.onGround = playerState.isCollidedVertically && oldVelY < 0

        let blockPos = pos.offset(0, -0.2, 0).floored()
        let blockAtFeet = world.getBlock(blockPos)

        if (blockAtFeet?.type === 0)
        {
            const downBlock = world.getBlock(blockPos.offset(0, -1, 0))

            // warn: string comp might be unreliable and cause performance issues!
            if (downBlock.name.endsWith('wall') || downBlock.name.startsWith('fence'))
            {
                blockAtFeet = downBlock
            }
        }

        if (dx !== oldVelX) motion.x = 0
        if (dz !== oldVelZ) motion.z = 0
        if (dy !== oldVelY) {
            if (blockAtFeet && blockAtFeet.type === slimeBlockId && !playerState.control.sneak) {
                motion.y = -motion.y
            } else {
                motion.y = 0
            }
        }

        // Finally, apply block collisions (web, soulsand...)
        doBlockCollisions(playerState)
    }

    function doBlockCollisions(playerState) {
        const {motion, pos} = playerState
        const playerBB = getPlayerBB(pos)
        playerBB.contract(0.001, 0.001, 0.001)
        const cursor = new Vec3(0, 0, 0)
        for (cursor.x = Math.floor(playerBB.minX); cursor.x <= Math.floor(playerBB.maxX); cursor.x++) {
            for (cursor.y = Math.floor(playerBB.minY); cursor.y <= Math.floor(playerBB.maxY); cursor.y++) {
                for (cursor.z = Math.floor(playerBB.minZ); cursor.z <= Math.floor(playerBB.maxZ); cursor.z++) {
                    const block = world.getBlock(cursor)
                    if (block) {
                        if (block.type === soulsandId) {
                            motion.x *= physics.soulsandSpeed
                            motion.z *= physics.soulsandSpeed
                        }
                        if (block.type === webId) {
                            playerState.isInWeb = true
                        }
                    }
                }
            }
        }
    }

    // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/Entity.java#L1224
    function moveFlying(playerState, moveStrafe, moveForward, friction) {
        const {motion} = playerState

        const speedSquared = moveStrafe * moveStrafe + moveForward * moveForward

        if (speedSquared >= physics.negligeableFlyingSpeed) {
            let speed = Math.sqrt(speedSquared)
            if (speed < 1.0) {
                speed = 1.0
            }
            speed = friction / speed
            moveStrafe = moveStrafe * speed;
            moveForward = moveForward * speed;
            const sin = sin32(playerState.yawDegrees * DEG_TO_RAD)
            const cos = cos32(playerState.yawDegrees * DEG_TO_RAD)
            motion.x += Math.fround(-moveStrafe * cos - moveForward * sin)
            motion.z += Math.fround(moveForward * cos - moveStrafe * sin)
        }
    }

    const climbableTrapdoorFeature = supportFeature('climbableTrapdoor')

    function isOnLadder(world, pos) {
        const block = world.getBlock(pos)
        if (!block) {
            return false
        }
        if (block.type === ladderId || block.type === vineId) {
            return true
        }

        // Since 1.9, when a trapdoor satisfies the following conditions, it also becomes climbable:
        //  1. The trapdoor is placed directly above a ladder.
        //  2. The trapdoor is opened.
        //  3. The trapdoor and the ladder directly below it face the same direction.
        if (climbableTrapdoorFeature && trapdoorIds.has(block.type)) {
            const blockBelow = world.getBlock(pos.offset(0, -1, 0))
            if (blockBelow.type !== ladderId) {
                return false
            } // condition 1.
            const blockProperties = block._properties
            if (!blockProperties.open) {
                return false
            } // condition 2.
            if (blockProperties.facing !== blockBelow.getProperties().facing) {
                return false
            } // condition 3
            return true
        }

        return false
    }

    function isOffsetPositionInLiquid(world, pos) {
        const pBB = getPlayerBB(pos)
        return !getSurroundingBBs(world, pBB).some(x => pBB.intersects(x))
            // any materialliquid, which is lava and water
            && !isMaterialInBB(world, pBB, liquidIds)
    }

    function moveEntityWithHeading(playerState, world, strafe, forward) {
        const {motion, pos} = playerState

        let playerSpeedAttribute
        if (playerState.attributes && playerState.attributes[physics.movementSpeedAttribute]) {
            // Use server-side player attributes
            playerSpeedAttribute = playerState.attributes[physics.movementSpeedAttribute]
        } else {
            // Create an attribute if the player does not have it
            playerSpeedAttribute = attribute.createAttributeValue(physics.playerSpeed)
        }
        // Client-side sprinting (don't rely on server-side sprinting)
        // setSprinting in LivingEntity.java
        playerSpeedAttribute = attribute.deleteAttributeModifier(playerSpeedAttribute, physics.sprintingUUID) // always delete sprinting (if it exists)
        if (playerState.control.sprint && !attribute.checkAttributeModifier(playerSpeedAttribute, physics.sprintingUUID)) {
            playerSpeedAttribute = attribute.addAttributeModifier(playerSpeedAttribute, {
                uuid: physics.sprintingUUID,
                amount: physics.sprintSpeed,
                operation: 2
            })
        }
        // Calculate what the speed is (0.1 if no modification)
        const attributeSpeed = attribute.getAttributeValue(playerSpeedAttribute)

        if (playerState.isInWater) {
            // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/EntityLivingBase.java#L1701
            const lastY = pos.y
            let inertia = physics.waterInertia
            let acceleration = physics.baseLiquidAcceleration
            let strider = Math.min(playerState.depthStrider, 3)

            if (!playerState.onGround) {
                strider = Math.fround(strider * Math.fround(0.5))
            }

            if (strider > 0) {
                inertia = Math.fround(inertia + (Math.fround(0.54600006) - inertia) * strider / 3)
                acceleration = Math.fround(acceleration + (attributeSpeed - acceleration) * strider / 3)
            }

            moveFlying(playerState, strafe, forward, acceleration)
            moveEntity(playerState, world, motion.x, motion.y, motion.z)

            motion.x *= inertia
            motion.y *= physics.waterInertia
            motion.z *= inertia
            motion.y -= physics.waterGravity

            if (playerState.isCollidedHorizontally && isOffsetPositionInLiquid(world, pos.offset(motion.x, motion.y + 0.6 - pos.y + lastY, motion.z))) {
                motion.y = physics.outOfLiquidImpulse // jump out of liquid
            }
        } else if (playerState.isInLava) {
            const lastY = pos.y
            moveFlying(playerState, strafe, forward, physics.baseLiquidAcceleration)
            moveEntity(playerState, world, motion.x, motion.y, motion.z)
            motion.x *= physics.lavaInertia
            motion.y *= physics.lavaInertia
            motion.z *= physics.lavaInertia
            motion.y -= physics.lavaGravity
            if (playerState.isCollidedHorizontally && isOffsetPositionInLiquid(world, pos.offset(motion.x, motion.y + 0.6 - pos.y + lastY, motion.z))) {
                motion.y = physics.outOfLiquidImpulse
            }
        } else {
            // Normal movement
            let inertia = physics.airborneInertia
            if (playerState.onGround) {
                const blockUnder = world.getBlock(pos.floored().offset(0, -1, 0))
                const slipperiness = blockUnder?.type && typeof blockSlipperiness[blockUnder.type] === 'number' ?
                    blockSlipperiness[blockUnder.type] : physics.defaultSlipperiness
                inertia = Math.fround(slipperiness * Math.fround(0.91))
            }

            const accelerationScale = physics.magicFrictionCubed / Math.fround(inertia * inertia * inertia)
            let acceleration = attributeSpeed * accelerationScale
            if (!playerState.onGround) {
                let jumpMovementFactor = physics.airborneAcceleration
                if (playerState.control.sprint) {
                    jumpMovementFactor += physics.airborneAcceleration * 0.3
                }
                acceleration = jumpMovementFactor
            }

            moveFlying(playerState, strafe, forward, acceleration)

            if (isOnLadder(world, pos)) {
                motion.x = math.clamp(-physics.ladderMaxSpeed, motion.x, physics.ladderMaxSpeed)
                motion.z = math.clamp(-physics.ladderMaxSpeed, motion.z, physics.ladderMaxSpeed)
                if (motion.y < -physics.ladderClimbSpeed) {
                    motion.y = -physics.ladderClimbSpeed
                }
                if (playerState.control.sneak && motion.y < 0) {
                    motion.y = 0
                }
            }

            moveEntity(playerState, world, motion.x, motion.y, motion.z)

            if (isOnLadder(world, pos) && (playerState.isCollidedHorizontally ||
                (supportFeature('climbUsingJump') && playerState.control.jump))) {
                motion.y = physics.ladderClimbSpeed // climb ladder
            }

            // unloaded chunks 1.8 behavior
            // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/EntityLivingBase.java#L1664
            if (!world.getBlock(new Vec3(pos.x, 0, pos.z).floored())) {
                if (pos.y > 0) {
                    motion.y = -0.1
                } else {
                    motion.y = 0
                }
            } else {
                motion.y -= physics.gravity
            }

            motion.y *= physics.airdrag
            motion.x = motion.x * inertia
            motion.z = motion.z * inertia
        }
    }

    function isMaterialInBB(world, queryBB, types) {
        const cursor = new Vec3(0, 0, 0)
        for (cursor.y = Math.floor(queryBB.minY); cursor.y <= Math.floor(queryBB.maxY); cursor.y++) {
            for (cursor.z = Math.floor(queryBB.minZ); cursor.z <= Math.floor(queryBB.maxZ); cursor.z++) {
                for (cursor.x = Math.floor(queryBB.minX); cursor.x <= Math.floor(queryBB.maxX); cursor.x++) {
                    const block = world.getBlock(cursor)
                    if (block && types.includes(block.type)) return true
                }
            }
        }
        return false
    }

    function getLiquidHeightPcent(block) {
        return (getRenderedDepth(block) + 1) / 9
    }

    function getRenderedDepth(block) {
        if (!block) return -1
        if (block.isWaterlogged) return 0
        if (!waterIds.includes(block.type)) return -1
        const meta = block.metadata
        return meta >= 8 ? 0 : meta
    }

    function getFlow(world, block) {
        const curlevel = getRenderedDepth(block)
        const flow = new Vec3(0, 0, 0)
        for (const [dx, dz] of [[0, 1], [-1, 0], [0, -1], [1, 0]]) {
            const adjBlock = world.getBlock(block.position.offset(dx, 0, dz))
            const adjLevel = getRenderedDepth(adjBlock)
            if (adjLevel < 0) {
                if (adjBlock && adjBlock.boundingBox !== 'empty') {
                    const adjLevel = getRenderedDepth(world.getBlock(block.position.offset(dx, -1, dz)))
                    if (adjLevel >= 0) {
                        const f = adjLevel - (curlevel - 8)
                        flow.x += dx * f
                        flow.z += dz * f
                    }
                }
            } else {
                const f = adjLevel - curlevel
                flow.x += dx * f
                flow.z += dz * f
            }
        }

        if (block.metadata >= 8) {
            for (const [dx, dz] of [[0, 1], [-1, 0], [0, -1], [1, 0]]) {
                const adjBlock = world.getBlock(block.position.offset(dx, 0, dz))
                const adjUpBlock = world.getBlock(block.position.offset(dx, 1, dz))
                if ((adjBlock && adjBlock.boundingBox !== 'empty') || (adjUpBlock && adjUpBlock.boundingBox !== 'empty')) {
                    flow.normalize().translate(0, -6, 0)
                }
            }
        }

        return flow.normalize()
    }

    function getWaterInBB(world, bb) {
        const waterBlocks = []
        const cursor = new Vec3(0, 0, 0)
        for (cursor.y = Math.floor(bb.minY); cursor.y <= Math.floor(bb.maxY); cursor.y++) {
            for (cursor.z = Math.floor(bb.minZ); cursor.z <= Math.floor(bb.maxZ); cursor.z++) {
                for (cursor.x = Math.floor(bb.minX); cursor.x <= Math.floor(bb.maxX); cursor.x++) {
                    const block = world.getBlock(cursor)
                    if (block && (waterIds.includes(block.type))) {
                        const waterLevel = cursor.y + 1 - getLiquidHeightPcent(block)
                        if (Math.ceil(bb.maxY) >= waterLevel) waterBlocks.push(block)
                    }
                }
            }
        }
        return waterBlocks
    }

    function isInWaterApplyCurrent(world, bb, vel) {
        const acceleration = new Vec3(0, 0, 0)
        const waterBlocks = getWaterInBB(world, bb)
        const isInWater = waterBlocks.length > 0
        for (const block of waterBlocks) {
            const flow = getFlow(world, block)
            acceleration.add(flow)
        }

        const len = acceleration.norm()
        if (len > 0) {
            vel.x += acceleration.x / len * 0.014
            vel.y += acceleration.y / len * 0.014
            vel.z += acceleration.z / len * 0.014
        }
        return isInWater
    }

    return physics
}

function getEffectLevel(mcData, effectName, effects) {
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

function getEnchantmentLevel(mcData, enchantmentName, enchantments) {
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

class PlayerState {
    constructor(bot, control) {
        const mcData = require('minecraft-data')(bot.version)

        // Input / Outputs
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
        // both rotational values in radians
        this.yaw = bot.entity.yaw
        this.pitch = bot.entity.pitch
        // both rotational values in degrees (notchian format). they should be float32 to replicate what the server should receive
        this.yawDegrees = Math.fround(bot.entity.yawDegrees)
        this.pitchDegrees = Math.fround(bot.entity.pitchDegrees)
        this.control = control

        // effects
        const effects = bot.entity.effects

        this.jumpBoost = getEffectLevel(mcData, 'JumpBoost', effects)

        // armour enchantments
        const boots = bot.inventory.slots[8]

        if (boots && boots.nbt) {
            const simplifiedNbt = nbt.simplify(boots.nbt)
            const enchantments = simplifiedNbt.Enchantments ?? simplifiedNbt.ench ?? []
            const enchantmentsMap = boots?.componentMap?.get("enchantments")
            const strider = enchantmentsMap?.data?.enchantments?.find(({id, level}) => id === 7)
            this.depthStrider = strider ? strider.level : getEnchantmentLevel(mcData, 'depth_strider', enchantments)
        } else {
            this.depthStrider = 0
        }
    }

    apply(bot) {
        bot.entity.position = this.pos
        bot.entity.velocity = this.motion
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

module.exports = {Physics, PlayerState}

// physics based on the 1.21.5 client
// reference code: client/net/minecraft/world/entity/LivingEntity.java,
// client/net/minecraft/world/entity/player/Player.java,
// client/net/minecraft/world/entity/Entity.java

const Vec3 = require('vec3').Vec3
const mcData = require('minecraft-data')('1.8.9')

const AABB = require('./lib/aabb')
const attribute = require('./lib/attribute')
const { IntSet } = require('./lib/util')
const { f32, f32div, f32mul, f32sin, f32cos, f32add, f32sub, clamp } = require('./lib/math')
const { Vec3I } = require('./lib/vec')

// https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/EntityLivingBase.java#L1578C42-L1578C53
const DEG_TO_RAD = f32div(f32(Math.PI), f32(180.0))
const RAD_TO_DEG = 180.0 / Math.PI

function Physics (world) {
  const blocksByName = mcData.blocksByName

  const physics = {
    yawSpeed: 60.0,
    pitchSpeed: 30.0,
    // this.motionY -= 0.08D;, EntityLivingBase.java
    gravity: 0.08,
    // this.motionY *= 0.9800000190734863D;, EntityLivingBase.java. 32 bit equivalent of 0.98
    airdrag: f32(0.98),
    // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/player/EntityPlayer.java#L163C5-L164C40
    playerSpeed: f32(0.1),
    airborneAcceleration: f32(0.02),
    // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/EntityLivingBase.java#L1610
    airborneInertia: f32(0.91),
    sprintSpeed: f32(0.3),
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
    // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/EntityLivingBase.java#L1559
    jumpMotionY: f32(0.42),
    ladderClimbSpeed: 0.15,
    // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/Entity.java#L375
    playerHalfWidth: f32div(f32(0.6), f32(2)),
    playerHeight: f32(1.8),
    waterInertia: f32(0.8),
    // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/EntityLivingBase.java#L1689
    lavaInertia: 0.5,
    baseLiquidAcceleration: f32(0.02),
    // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/block/Block.java#L291
    defaultSlipperiness: f32(0.6),
    outOfLiquidImpulse: f32(0.3),
    autojumpCooldown: 10, // ticks (0.5s)
    movementSpeedAttribute: mcData.attributesByName.movementSpeed.resource,
    // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/EntityLivingBase.java#L56
    sprintingUUID: '662a6b8d-da3e-4c1c-8813-96ea6097278d',
    // default slipperiness * friction
    // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/EntityLivingBase.java#L1719C30-L1719C39
    magicFriction: f32(0.546),
    // seems like a different value is used for water??
    // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/EntityLivingBase.java#L1719C28-L1719C38
    magicFrictionWater: f32(0.54600006),
    magicFrictionCubed: f32(0.16277136),
    // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/block/BlockSoulSand.java#L30
    soulsandSpeed: 0.4,
    flowConstant: 0.014,
    jumpBoostConstant: f32(0.1),
    airSprintConstant: f32(0.2),
    waterGravity: 0.02,
    lavaGravity: 0.02,
    moveMultiplier: f32(0.98),
    striderConstant: f32(0.5)
  }

  const waterIds = [blocksByName.water.id, blocksByName.flowing_water ? blocksByName.flowing_water.id : -1]
  const lavaIds = [blocksByName.lava.id, blocksByName.flowing_lava ? blocksByName.flowing_lava.id : -1]
  const liquidIds = waterIds.concat(lavaIds)
  const blockSlipperiness = {}
  const slimeBlockId = blocksByName.slime_block ? blocksByName.slime_block.id : blocksByName.slime.id
  blockSlipperiness[slimeBlockId] = f32(0.8)
  blockSlipperiness[blocksByName.ice.id] = f32(0.98)
  blockSlipperiness[blocksByName.packed_ice.id] = f32(0.98)

  const soulsandId = blocksByName.soul_sand.id
  const webId = blocksByName.cobweb ? blocksByName.cobweb.id : blocksByName.web.id
  const ladderId = blocksByName.ladder.id
  const vineId = blocksByName.vine.id

  function getPlayerBB (pos) {
    const w = physics.playerHalfWidth
    return new AABB(-w, 0, -w, w, physics.playerHeight, w).offset(pos.x, pos.y, pos.z)
  }

  function resetPositionToBB (bb, pos) {
    pos.x = (bb.minX + bb.maxX) / 2.0
    pos.y = bb.minY
    pos.z = (bb.minZ + bb.maxZ) / 2.0
  }

  const wallIds = new IntSet([
    'cobblestone_wall'
  ].map(nameToId))

  const fenceIds = new IntSet([
    'fence',
    'spruce_fence',
    'birch_fence',
    'jungle_fence',
    'acacia_fence',
    'dark_oak_fence',
    'nether_brick_fence',
  ].map(nameToId))

  const fenceGateIds = new IntSet([
    'fence_gate',
    'spruce_fence_gate',
    'birch_fence_gate',
    'jungle_fence_gate',
    'acacia_fence_gate',
    'dark_oak_fence_gate',
  ].map(nameToId))

  const stairIds = new IntSet([
    'oak_stairs',
    'stone_stairs',
    'brick_stairs',
    'stone_brick_stairs',
    'nether_brick_stairs',
    'sandstone_stairs',
    'spruce_stairs',
    'birch_stairs',
    'jungle_stairs',
    'quartz_stairs',
    'acacia_stairs',
    'dark_oak_stairs',
    'red_sandstone_stairs',
  ].map(nameToId))

  const glassPaneIds = new IntSet([
    'glass_pane',
    'stained_glass_pane',
  ].map(nameToId))

  function nameToId (name) {
    const block = mcData.blocksByName[name]
    if (!block) throw new Error(`Block not found: ${name}`)
    return block.id
  }

  const CARDINAL = [
    // north -z
    new Vec3(0, 0, -1),
    // east +x
    new Vec3(1, 0, 0),
    // south +z
    new Vec3(0, 0, 1),
    // west -x
    new Vec3(-1, 0, 0)
  ]

  function updateWallBB (connectDirection, boundingBox) {
    switch (connectDirection) {
      case 0: // north
        boundingBox[0][2] = 0.0
        break
      case 1: // east
        boundingBox[0][3] = 1.0
        break
      case 2: // south
        boundingBox[0][5] = 1.0
        break
      case 3: // west
        boundingBox[0][0] = 0.0
        break
    }
  }

  function updateFenceBB (connectDirection, boundingBox) {
    switch (connectDirection) {
      case 0: // north (-z)
        // extends from center to full north edge
        boundingBox.push([0.375, 0.0, 0.0, 0.625, 1.5, 0.375])
        break
      case 1: // east (+x)
        // extends from center to full east edge
        boundingBox.push([0.625, 0.0, 0.375, 1.0, 1.5, 0.625])
        break
      case 2: // south (+z)
        // extends from center to full south edge
        boundingBox.push([0.375, 0.0, 0.625, 0.625, 1.5, 1.0])
        break
      case 3: // west (-x)
        // extends from center to full west edge
        boundingBox.push([0.0, 0.0, 0.375, 0.375, 1.5, 0.625])
        break
    }
  }

  function computeWallBB (world, origin) {
    const baseBoundingBox = [[0.25, 0.0, 0.25, 0.75, 1.5, 0.75]]

    // check north, east, south, west for neighboring walls to connect to
    for (let i = 0; i < CARDINAL.length; i++) {
      // update the wall properties and the bounding box
      const neighborBlock = world.getBlock(origin.plus(CARDINAL[i]))
      if (!neighborBlock || !wallIds.has(neighborBlock.type)) continue
      updateWallBB(i, baseBoundingBox)
    }
    return baseBoundingBox
  }

  function computeFenceBB (world, origin) {
    const baseBoundingBox = [[0.375, 0.0, 0.375, 0.625, 1.5, 0.625]]
    for (let i = 0; i < CARDINAL.length; i++) {
      // update the fence properties and the bounding box
      const neighborBlock = world.getBlock(origin.plus(CARDINAL[i]))
      if (!neighborBlock || (!fenceIds.has(neighborBlock.type) && !fenceGateIds.has(neighborBlock.type))) continue
      updateFenceBB(i, baseBoundingBox)
    }
    return baseBoundingBox
  }

  function rotateY (facing, right = true) {
    // 0=north, 1=east, 2=south, 3=west
    return right ? (facing + 1) % 4 : (facing + 3) % 4
  }

  const FACING_MAP = {
    north: 0,
    east: 1,
    south: 2,
    west: 3
  }

  function getFacing (block) {
    const facing = block._properties.facing
    return FACING_MAP[facing]
  }

  function isTopHalf (block) {
    return block._properties.half === 'top'
  }

  /**
   * Compute stair shape: straight / inner_left / inner_right / outer_left / outer_right
   */
  function computeStairShape (world, pos, facing, halfTop) {
    const forwardPos = pos.plus(CARDINAL[facing])
    const backPos = pos.minus(CARDINAL[facing])
    const forward = world.getBlock(forwardPos)
    const back = world.getBlock(backPos)

    function sameHalf (block) {
      return block && stairIds.has(block.type) && isTopHalf(block) === halfTop
    }

    // ---- OUTER CORNERS ----
    if (forward && sameHalf(forward)) {
      const nfacing = getFacing(forward)
      if (nfacing === rotateY(facing, false)) return 'outer_left'
      if (nfacing === rotateY(facing, true)) return 'outer_right'
    }

    // ---- INNER CORNERS ----
    if (back && sameHalf(back)) {
      const nfacing = getFacing(back)
      if (nfacing === rotateY(facing, false)) return 'inner_left'
      if (nfacing === rotateY(facing, true)) return 'inner_right'
    }

    return 'straight'
  }

  /**
   * Compute AABBs for a stair block
   */
  function computeStairBB (world, pos, block) {
    const facing = getFacing(block)
    const halfTop = isTopHalf(block)
    const shape = computeStairShape(world, pos, facing, halfTop)

    const baseY = halfTop ? 0.5 : 0.0
    const topY = halfTop ? 1.0 : 0.5
    const stepYMin = halfTop ? 0.0 : 0.5
    const stepYMax = halfTop ? 0.5 : 1.0

    const boxes = []

    // --- STRAIGHT / BASE STEP ---
    if (shape === 'straight') {
      boxes.push(...straightBoxes(facing, baseY, topY, stepYMin, stepYMax))
    }

    // --- OUTER CORNERS (convex) ---
    else if (shape === 'outer_left' || shape === 'outer_right') {
      boxes.push(...outerCornerBoxes(shape, facing, baseY, topY, stepYMin, stepYMax))
    }

    // --- INNER CORNERS (concave) ---
    else if (shape === 'inner_left' || shape === 'inner_right') {
      boxes.push(...innerCornerBoxes(shape, facing, baseY, topY, stepYMin, stepYMax))
    }

    return boxes
  }

  // === Base geometry tables ===
  // Straight stairs (two parts)
  function straightBoxes (facing, baseY, topY, stepYMin, stepYMax) {
    switch (facing) {
      case 0: // north
        return [
          [0, baseY, 0.5, 1, topY, 1],
          [0, stepYMin, 0, 1, stepYMax, 0.5]
        ]
      case 1: // east
        return [
          [0, baseY, 0, 1, topY, 1],
          [0.5, stepYMin, 0, 1, stepYMax, 1]
        ]
      case 2: // south
        return [
          [0, baseY, 0, 1, topY, 1],
          [0, stepYMin, 0.5, 1, stepYMax, 1]
        ]
      case 3: // west
        return [
          [0.5, baseY, 0, 1, topY, 1],
          [0, stepYMin, 0, 0.5, stepYMax, 1]
        ]
    }
  }

  // Outer corners (smaller L-shape)
  function outerCornerBoxes (shape, facing, baseY, topY, stepYMin, stepYMax) {
    const right = shape === 'outer_right'
    switch (facing) {
      case 0: // north
        return right
          ? [
            [0, baseY, 0.5, 1, topY, 1],
            [0.5, stepYMin, 0, 1, stepYMax, 0.5]
          ]
          : [
            [0, baseY, 0.5, 1, topY, 1],
            [0, stepYMin, 0, 0.5, stepYMax, 0.5]
          ]
      case 1: // east
        return right
          ? [
            [0, baseY, 0, 1, topY, 1],
            [0.5, stepYMin, 0.5, 1, stepYMax, 1]
          ]
          : [
            [0, baseY, 0, 1, topY, 1],
            [0.5, stepYMin, 0, 1, stepYMax, 0.5]
          ]
      case 2: // south
        return right
          ? [
            [0, baseY, 0, 1, topY, 1],
            [0, stepYMin, 0.5, 0.5, stepYMax, 1]
          ]
          : [
            [0, baseY, 0, 1, topY, 1],
            [0.5, stepYMin, 0.5, 1, stepYMax, 1]
          ]
      case 3: // west
        return right
          ? [
            [0.5, baseY, 0, 1, topY, 1],
            [0, stepYMin, 0, 0.5, stepYMax, 0.5]
          ]
          : [
            [0.5, baseY, 0, 1, topY, 1],
            [0, stepYMin, 0.5, 0.5, stepYMax, 1]
          ]
    }
  }

  // Inner corners (concave) — base + two step strips
  function innerCornerBoxes (shape, facing, baseY, topY, stepYMin, stepYMax) {
    const left = shape === 'inner_left'
    switch (facing) {
      case 0: // north (front = z[0..0.5], left = west x[0..0.5], right = east x[0.5..1])
        return left
          ? [
            // base slab (back half)
            [0, baseY, 0.5, 1, topY, 1],
            // facing strip (north/front)
            [0, stepYMin, 0, 1, stepYMax, 0.5],
            // side strip (west/left)
            [0, stepYMin, 0, 0.5, stepYMax, 1],
          ]
          : [
            [0, baseY, 0.5, 1, topY, 1],
            [0, stepYMin, 0, 1, stepYMax, 0.5],
            // side strip (east/right)
            [0.5, stepYMin, 0, 1, stepYMax, 1],
          ]

      case 1: // east (front = x[0.5..1], left = north z[0..0.5], right = south z[0.5..1])
        return left
          ? [
            // base slab (match your straight base for east = full slab)
            [0, baseY, 0, 1, topY, 1],
            // facing strip (east/front)
            [0.5, stepYMin, 0, 1, stepYMax, 1],
            // side strip (north/left)
            [0, stepYMin, 0, 1, stepYMax, 0.5],
          ]
          : [
            [0, baseY, 0, 1, topY, 1],
            [0.5, stepYMin, 0, 1, stepYMax, 1],
            // side strip (south/right)
            [0, stepYMin, 0.5, 1, stepYMax, 1],
          ]

      case 2: // south (front = z[0.5..1], left = east x[0.5..1], right = west x[0..0.5])
        return left
          ? [
            // base slab (match your straight base for south = full slab)
            [0, baseY, 0, 1, topY, 1],
            // facing strip (south/front)
            [0, stepYMin, 0.5, 1, stepYMax, 1],
            // side strip (east/left)
            [0.5, stepYMin, 0, 1, stepYMax, 1],
          ]
          : [
            [0, baseY, 0, 1, topY, 1],
            [0, stepYMin, 0.5, 1, stepYMax, 1],
            // side strip (west/right)
            [0, stepYMin, 0, 0.5, stepYMax, 1],
          ]

      case 3: // west (front = x[0..0.5], left = south z[0.5..1], right = north z[0..0.5])
        return left
          ? [
            // base slab (your straight base for west = x[0.5..1])
            [0.5, baseY, 0, 1, topY, 1],
            // facing strip (west/front)
            [0, stepYMin, 0, 0.5, stepYMax, 1],
            // side strip (south/left)
            [0, stepYMin, 0.5, 1, stepYMax, 1],
          ]
          : [
            [0.5, baseY, 0, 1, topY, 1],
            [0, stepYMin, 0, 0.5, stepYMax, 1],
            // side strip (north/right)
            [0, stepYMin, 0, 1, stepYMax, 0.5],
          ]
    }
  }

  const glassPaneCanConnect = new IntSet(['glass', 'stained_glass'].map(nameToId))

  function computePaneBB (world, origin) {
    const baseBoxes = []

    // Helper: determines if a glass pane connects to the given neighbor
    function canConnect (block) {
      if (!block) return false
      if (glassPaneIds.has(block.type) || glassPaneCanConnect.has(block.type)) return true
      if (block.boundingBox && block.boundingBox !== 'empty') return block.boundingBox !== 'empty'
      return false
    }

    // Get neighboring blocks
    const neighbors = CARDINAL.map(dir => world.getBlock(origin.plus(dir)))
    const [north, east, south, west] = neighbors

    const canConnectNorth = canConnect(north)
    const canConnectEast = canConnect(east)
    const canConnectSouth = canConnect(south)
    const canConnectWest = canConnect(west)
    const anyConnection = canConnectNorth || canConnectEast || canConnectSouth || canConnectWest

    // Handle east/west axis
    if ((!canConnectWest || !canConnectEast) && anyConnection) {
      if (canConnectWest) {
        baseBoxes.push([0.0, 0.0, 0.4375, 0.5, 1.0, 0.5625])
      } else if (canConnectEast) {
        baseBoxes.push([0.5, 0.0, 0.4375, 1.0, 1.0, 0.5625])
      }
    } else {
      // Either both connected or neither connected — add full NS plane
      baseBoxes.push([0.0, 0.0, 0.4375, 1.0, 1.0, 0.5625])
    }

    // Handle north/south axis
    if ((!canConnectNorth || !canConnectSouth) && anyConnection) {
      if (canConnectNorth) {
        baseBoxes.push([0.4375, 0.0, 0.0, 0.5625, 1.0, 0.5])
      } else if (canConnectSouth) {
        baseBoxes.push([0.4375, 0.0, 0.5, 0.5625, 1.0, 1.0])
      }
    } else {
      // Either both connected or neither connected — add full EW plane
      baseBoxes.push([0.4375, 0.0, 0.0, 0.5625, 1.0, 1.0])
    }

    return baseBoxes
  }

  const snowLayerId = blocksByName.snow_layer.id

  function getSuroundingBlocks (world, queryBB) {
    const surroundingBlocks = []
    const cursor = new Vec3(0, 0, 0)
    for (cursor.y = Math.floor(queryBB.minY) - 1; cursor.y <= Math.floor(queryBB.maxY); cursor.y++) {
      for (cursor.z = Math.floor(queryBB.minZ); cursor.z <= Math.floor(queryBB.maxZ); cursor.z++) {
        for (cursor.x = Math.floor(queryBB.minX); cursor.x <= Math.floor(queryBB.maxX); cursor.x++) {
          const block = world.getBlock(cursor)
          if (block) {
            surroundingBlocks.push(block)
          }
        }
      }
    }
    return surroundingBlocks
  }

  function getSurroundingBBs (world, queryBB) {
    const surroundingBBs = []
    const cursor = new Vec3(0, 0, 0)
    for (cursor.y = Math.floor(queryBB.minY) - 1; cursor.y <= Math.floor(queryBB.maxY); cursor.y++) {
      for (cursor.z = Math.floor(queryBB.minZ); cursor.z <= Math.floor(queryBB.maxZ); cursor.z++) {
        for (cursor.x = Math.floor(queryBB.minX); cursor.x <= Math.floor(queryBB.maxX); cursor.x++) {
          const block = world.getBlock(cursor)
          if (block) {
            const blockPos = block.position
            let shapes = block.shapes
            if (wallIds.has(block.type)) {
              shapes = computeWallBB(world, blockPos)
            } else if (stairIds.has(block.type)) {
              shapes = computeStairBB(world, blockPos, block)
            } else if (fenceIds.has(block.type)) {
              shapes = computeFenceBB(world, blockPos)
            } else if (glassPaneIds.has(block.type)) {
              shapes = computePaneBB(world, blockPos)
            } else if (block.type === snowLayerId && block._properties.layers === 8) {
              const blockAbove = world.getBlock(blockPos.offset(0, 1, 0))
              if (blockAbove && blockAbove.type === snowLayerId) {
                shapes = [[0, 0, 0, 1, 1, 1]]
              }
            }
            for (const shape of shapes) {
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

  // protected BlockPos getOnPos(float var1) {
  //   if (this.mainSupportingBlockPos.isPresent()) {
  //     BlockPos var5 = (BlockPos)this.mainSupportingBlockPos.get();
  //     if (!(var1 > 1.0E-5F)) {
  //       return var5;
  //     } else {
  //       BlockState var6 = this.level().getBlockState(var5);
  //       return (!((double)var1 <= 0.5) || !var6.is(BlockTags.FENCES)) && !var6.is(BlockTags.WALLS) && !(var6.getBlock() instanceof FenceGateBlock) ? var5.atY(Mth.floor(this.position.y - (double)var1)) : var5;
  //     }
  //   } else {
  //     int var2 = Mth.floor(this.position.x);
  //     int var3 = Mth.floor(this.position.y - (double)var1);
  //     int var4 = Mth.floor(this.position.z);
  //     return new BlockPos(var2, var3, var4);
  //   }
  // }

  //    protected void checkSupportingBlock(boolean var1, @Nullable Vec3 var2) {
  //       if (var1) {
  //          AABB var3 = this.getBoundingBox();
  //          AABB var4 = new AABB(var3.minX, var3.minY - 1.0E-6, var3.minZ, var3.maxX, var3.minY, var3.maxZ);
  //          Optional var5 = this.level.findSupportingBlock(this, var4);
  //          if (!var5.isPresent() && !this.onGroundNoBlocks) {
  //             if (var2 != null) {
  //                AABB var6 = var4.move(-var2.x, 0.0, -var2.z);
  //                var5 = this.level.findSupportingBlock(this, var6);
  //                this.mainSupportingBlockPos = var5;
  //             }
  //          } else {
  //             this.mainSupportingBlockPos = var5;
  //          }
  //
  //          this.onGroundNoBlocks = var5.isEmpty();
  //       } else {
  //          this.onGroundNoBlocks = false;
  //          if (this.mainSupportingBlockPos.isPresent()) {
  //             this.mainSupportingBlockPos = Optional.empty();
  //          }
  //       }
  //
  //    }

  physics.getOnPos = (playerState, world, offsetY) => {
    const pos = playerState.position
    const supportingBlockPos = playerState.getSupportingBlock(playerState, world)
    if (supportingBlockPos) {
      if (offsetY <= 1.0e-5) {
        return supportingBlockPos
      } else {
        const block = world.getBlock(supportingBlockPos)
        if ((!offsetY <= 0.5 || !block.isFence()) && !block.isWall() && !block.isFenceGate()) {
          return new Vec3(supportingBlockPos.x, Math.floor(pos.y - offsetY), supportingBlockPos.z)
        } else {
          return new Vec3(supportingBlockPos.x, supportingBlockPos.y, supportingBlockPos.z)
        }
      }
    } else {
      const x = Math.floor(pos.x)
      const y = Math.floor(pos.y - offsetY)
      const z = Math.floor(pos.z)
      return new Vec3(x, y, z)
    }
  }

  physics.getBlockPosBelowThatAffectsMyMovement = (playerState, world) => {
    return physics.getOnPos(playerState, world, f32(0.500001))
  }

  physics.travelInAir = (playerState, world) => {
  //   BlockPos var2 = this.getBlockPosBelowThatAffectsMyMovement();
    //       float var3 = this.onGround() ? this.level().getBlockState(var2).getBlock().getFriction() : 1.0F;
    //       float var4 = var3 * 0.91F;
    //       Vec3 var5 = this.handleRelativeFrictionAndCalculateMovement(var1, var3);
    //       double var6 = var5.y;
    //       MobEffectInstance var8 = this.getEffect(MobEffects.LEVITATION);
    //       if (var8 != null) {
    //          var6 += (0.05 * (double)(var8.getAmplifier() + 1) - var5.y) * 0.2;
    //       } else if (this.level().isClientSide && !this.level().hasChunkAt(var2)) {
    //          if (this.getY() > (double)this.level().getMinY()) {
    //             var6 = -0.1;
    //          } else {
    //             var6 = 0.0;
    //          }
    //       } else {
    //          var6 -= this.getEffectiveGravity();
    //       }
    //
    //       if (this.shouldDiscardFriction()) {
    //          this.setDeltaMovement(var5.x, var6, var5.z);
    //       } else {
    //          float var9 = this instanceof FlyingAnimal ? var4 : 0.98F;
    //          this.setDeltaMovement(var5.x * (double)var4, var6 * (double)var9, var5.z * (double)var4);
    //       }
    const blockBelow = physics.getBlockPosBelowThatAffectsMyMovement(playerState, world)
  }

  // public void move(MoverType var1, Vec3 var2) {
  //       if (this.noPhysics) {
  //          this.setPos(this.getX() + var2.x, this.getY() + var2.y, this.getZ() + var2.z);
  //       } else {
  //          if (var1 == MoverType.PISTON) {
  //             var2 = this.limitPistonMovement(var2);
  //             if (var2.equals(Vec3.ZERO)) {
  //                return;
  //             }
  //          }
  //
  //          ProfilerFiller var3 = Profiler.get();
  //          var3.push("move");
  //          if (this.stuckSpeedMultiplier.lengthSqr() > 1.0E-7) {
  //             var2 = var2.multiply(this.stuckSpeedMultiplier);
  //             this.stuckSpeedMultiplier = Vec3.ZERO;
  //             this.setDeltaMovement(Vec3.ZERO);
  //          }
  //
  //          var2 = this.maybeBackOffFromEdge(var2, var1);
  //          Vec3 var4 = this.collide(var2);
  //          double var5 = var4.lengthSqr();
  //          if (var5 > 1.0E-7 || var2.lengthSqr() - var5 < 1.0E-7) {
  //             if (this.fallDistance != 0.0 && var5 >= 1.0) {
  //                BlockHitResult var7 = this.level().clip(new ClipContext(this.position(), this.position().add(var4), ClipContext.Block.FALLDAMAGE_RESETTING, ClipContext.Fluid.WATER, this));
  //                if (var7.getType() != HitResult.Type.MISS) {
  //                   this.resetFallDistance();
  //                }
  //             }
  //
  //             Vec3 var15 = this.position();
  //             ObjectArrayList var8 = new ObjectArrayList();
  //
  //             for(Direction.Axis var10 : axisStepOrder(var4)) {
  //                double var11 = var4.get(var10);
  //                if (var11 != 0.0) {
  //                   Vec3 var13 = var15.relative(var10.getPositive(), var11);
  //                   var8.add(new Movement(var15, var13));
  //                   var15 = var13;
  //                }
  //             }
  //
  //             this.movementThisTick.add(var8);
  //             this.setPos(var15);
  //          }
  //
  //          var3.pop();
  //          var3.push("rest");
  //          boolean var16 = !Mth.equal(var2.x, var4.x);
  //          boolean var17 = !Mth.equal(var2.z, var4.z);
  //          this.horizontalCollision = var16 || var17;
  //          if (Math.abs(var2.y) > 0.0 || this.isLocalInstanceAuthoritative()) {
  //             this.verticalCollision = var2.y != var4.y;
  //             this.verticalCollisionBelow = this.verticalCollision && var2.y < 0.0;
  //             this.setOnGroundWithMovement(this.verticalCollisionBelow, this.horizontalCollision, var4);
  //          }
  //
  //          if (this.horizontalCollision) {
  //             this.minorHorizontalCollision = this.isHorizontalCollisionMinor(var4);
  //          } else {
  //             this.minorHorizontalCollision = false;
  //          }
  //
  //          BlockPos var18 = this.getOnPosLegacy();
  //          BlockState var19 = this.level().getBlockState(var18);
  //          if (this.isLocalInstanceAuthoritative()) {
  //             this.checkFallDamage(var4.y, this.onGround(), var19, var18);
  //          }
  //
  //          if (this.isRemoved()) {
  //             var3.pop();
  //          } else {
  //             if (this.horizontalCollision) {
  //                Vec3 var20 = this.getDeltaMovement();
  //                this.setDeltaMovement(var16 ? 0.0 : var20.x, var20.y, var17 ? 0.0 : var20.z);
  //             }
  //
  //             if (this.canSimulateMovement()) {
  //                Block var21 = var19.getBlock();
  //                if (var2.y != var4.y) {
  //                   var21.updateEntityMovementAfterFallOn(this.level(), this);
  //                }
  //             }
  //
  //             if (!this.level().isClientSide() || this.isLocalInstanceAuthoritative()) {
  //                MovementEmission var22 = this.getMovementEmission();
  //                if (var22.emitsAnything() && !this.isPassenger()) {
  //                   this.applyMovementEmissionAndPlaySound(var22, var4, var18, var19);
  //                }
  //             }
  //
  //             float var23 = this.getBlockSpeedFactor();
  //             this.setDeltaMovement(this.getDeltaMovement().multiply((double)var23, 1.0, (double)var23));
  //             var3.pop();
  //          }
  //       }
  //    }
  physics.move = () => {

  }


// default Optional<BlockPos> findSupportingBlock(Entity var1, AABB var2) {
//     BlockPos var3 = null;
//     double var4 = 1.7976931348623157E308;
//     BlockCollisions var6 = new BlockCollisions(this, var1, var2, false, (var0, var1x) -> var0);
//
//     while(var6.hasNext()) {
//       BlockPos var7 = (BlockPos)var6.next();
//       double var8 = var7.distToCenterSqr(var1.position());
//       if (var8 < var4 || var8 == var4 && (var3 == null || var3.compareTo(var7) < 0)) {
//         var3 = var7.immutable();
//         var4 = var8;
//       }
//     }
//
//     return Optional.ofNullable(var3);
//   }

  //    public double distToCenterSqr(double var1, double var3, double var5) {
  //       double var7 = (double)this.getX() + 0.5 - var1;
  //       double var9 = (double)this.getY() + 0.5 - var3;
  //       double var11 = (double)this.getZ() + 0.5 - var5;
  //       return var7 * var7 + var9 * var9 + var11 * var11;
  //    }

  // public int compareTo(Vec3i var1) {
  //       if (this.getY() == var1.getY()) {
  //          return this.getZ() == var1.getZ() ? this.getX() - var1.getX() : this.getZ() - var1.getZ();
  //       } else {
  //          return this.getY() - var1.getY();
  //       }
  //    }

  physics.distToCenterSqr = (blockPos, position) => {
    const dx = (blockPos.x + 0.5) - position.x
    const dy = (blockPos.y + 0.5) - position.y
    const dz = (blockPos.z + 0.5) - position.z
    return dx * dx + dy * dy + dz * dz
  }

  physics.Vec3I_compareTo = (a, b) => {
    if (a.y === b.y) {
      if (a.z === b.z) {
        return a.x - b.x
      } else {
        return a.z - b.z
      }
    } else {
      return a.y - b.y
    }
  }

  physics.findSupportingBlock = (playerState, world, queryBB) => {
    let closestPos = null
    let closestDistSqr = 1.7976931348623157E308
    const surroundingBlocks = getSuroundingBlocks(world, queryBB)
    for (const block of surroundingBlocks) {
      const blockPos = Vec3I.fromVec3(block.position)
      const distSqr = physics.distToCenterSqr(blockPos, playerState.pos)
      if (distSqr < closestDistSqr || (distSqr === closestDistSqr && (closestPos === null || physics.Vec3I_compareTo(blockPos, closestPos) < 0))) {
        closestPos = blockPos
        closestDistSqr = distSqr
      }
    }
    return closestPos
  }

  //    protected void checkSupportingBlock(boolean var1, @Nullable Vec3 var2) {
  //       if (var1) {
  //          AABB var3 = this.getBoundingBox();
  //          AABB var4 = new AABB(var3.minX, var3.minY - 1.0E-6, var3.minZ, var3.maxX, var3.minY, var3.maxZ);
  //          Optional var5 = this.level.findSupportingBlock(this, var4);
  //          if (!var5.isPresent() && !this.onGroundNoBlocks) {
  //             if (var2 != null) {
  //                AABB var6 = var4.move(-var2.x, 0.0, -var2.z);
  //                var5 = this.level.findSupportingBlock(this, var6);
  //                this.mainSupportingBlockPos = var5;
  //             }
  //          } else {
  //             this.mainSupportingBlockPos = var5;
  //          }
  //
  //          this.onGroundNoBlocks = var5.isEmpty();
  //       } else {
  //          this.onGroundNoBlocks = false;
  //          if (this.mainSupportingBlockPos.isPresent()) {
  //             this.mainSupportingBlockPos = Optional.empty();
  //          }
  //       }
  //
  //    }
  physics.getSupportingBlock = (playerState, world) => {
    const playerBB = getPlayerBB(playerState.pos)
    const queryBB = new AABB(
      playerBB.minX,
      playerBB.minY - 0.000001,
      playerBB.minZ,
      playerBB.maxX,
      playerBB.minY,
      playerBB.maxZ
    )
    const motion = playerState.motion

    const supportingBlockPos = physics.findSupportingBlock(playerState, world, queryBB)
    if (!supportingBlockPos) {
      // try offset BB by -motion.xz
      if (motion) {
        const offsetBB = queryBB.move(-motion.x, 0.0, -motion.z)
        return physics.findSupportingBlock(playerState, world, offsetBB)
      }
    } else {
      return supportingBlockPos
    }
    return false
  }

  // run one tick of player simulation
  // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/EntityLivingBase.java#L1948
  physics.simulatePlayer = (playerState, world) => {
    const { motion, pos } = playerState
    if (playerState.jumpTicks > 0) playerState.jumpTicks--
    if (!isNaN(playerState.yaw)) {
      playerState.yawDegrees = f32((Math.PI - playerState.yaw) * RAD_TO_DEG)
    }
    if (!isNaN(playerState.pitch)) {
      playerState.pitchDegrees = f32(-playerState.pitch * RAD_TO_DEG)
    }

    // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/Entity.java#L1111
    const waterBB = getPlayerBB(pos).contract(
      0.001,
      f32(0.400),
      0.001
    )

    // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/Entity.java#L1216
    const lavaBB = getPlayerBB(pos).contract(
      f32(0.1),
      f32(0.4),
      f32(0.1)
    )

    playerState.isInWater = isInWaterApplyCurrent(world, waterBB, motion)
    playerState.isInLava = isMaterialInBB(world, lavaBB, lavaIds)

    // Reset velocity component if it falls under the threshold
    if (Math.abs(motion.x) < physics.negligeableVelocity) motion.x = 0.0
    if (Math.abs(motion.y) < physics.negligeableVelocity) motion.y = 0.0
    if (Math.abs(motion.z) < physics.negligeableVelocity) motion.z = 0.0

    // Handle inputs
    if (playerState.control.jump || playerState.jumpQueued) {
      // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/EntityLivingBase.java#L1589
      if (playerState.isInWater || playerState.isInLava) {
        motion.y += physics.liquidMotionY
      } else if (playerState.onGround && playerState.jumpTicks === 0) {
        motion.y = physics.jumpMotionY
        if (playerState.jumpBoost > 0) {
          // compliance: can do += here, because it takes the double representation of the f32mul
          motion.y += f32mul(f32(playerState.jumpBoost), physics.jumpBoostConstant)
        }
        let forward = (playerState.control.forward - playerState.control.back)
        const isSprintingApplicable = forward > 0 && !playerState.control.sneak && !playerState.isInWater && !playerState.isInLava
        if (playerState.control.sprint && isSprintingApplicable) {
          // notchian yaw is inverted
          const notchianYaw = f32mul(playerState.yawDegrees, DEG_TO_RAD)
          // compliance: can do -= and += here, because it also takes the double representation of the f32mul
          motion.x -= f32mul(f32sin(notchianYaw), physics.airSprintConstant)
          motion.z += f32mul(f32cos(notchianYaw), physics.airSprintConstant)
        }
        playerState.jumpTicks = physics.autojumpCooldown
      }
    } else {
      playerState.jumpTicks = 0 // reset autojump cooldown
    }
    playerState.jumpQueued = false

    // movestrafing and moveforward are in range [-1.0, 1.0], already stored as F32
    let moveStrafing = f32(playerState.control.right - playerState.control.left)
    let moveForward = f32(playerState.control.forward - playerState.control.back)

    // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/util/MovementInputFromOptions.java#L42C1-L46C10
    if (playerState.control.sneak) {
      moveStrafing = f32(moveStrafing * physics.sneakSpeed)
      moveForward = f32(moveForward * physics.sneakSpeed)
    }

    moveStrafing = f32mul(moveStrafing, physics.moveMultiplier)
    moveForward = f32mul(moveForward, physics.moveMultiplier)

    moveEntityWithHeading(playerState, world, moveStrafing, moveForward)

    return playerState
  }

  function moveEntity (playerState, world, dx, dy, dz) {
    const { motion, pos } = playerState

    // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/Entity.java#L612
    if (playerState.isInWeb) {
      playerState.isInWeb = false
      // compliance: double * double
      dx *= 0.25
      dy *= f32(0.05)
      dz *= 0.25
      motion.x = 0.0
      motion.y = 0.0
      motion.z = 0.0
    }

    let oldVelX = dx
    let oldVelY = dy
    let oldVelZ = dz

    const validSneak = playerState.control.sneak && playerState.onGround

    if (validSneak) {
      const step = 0.05

      for (; dx !== 0 && getSurroundingBBs(world, getPlayerBB(pos).offset(dx, -1.0, 0)).length === 0; oldVelX = dx) {
        if (dx < step && dx >= -step) dx = 0
        else if (dx > 0) dx -= step
        else dx += step
      }

      for (; dz !== 0 && getSurroundingBBs(world, getPlayerBB(pos).offset(0, -1.0, dz)).length === 0; oldVelZ = dz) {
        if (dz < step && dz >= -step) dz = 0
        else if (dz > 0) dz -= step
        else dz += step
      }

      for (; dx !== 0 && dz !== 0 && getSurroundingBBs(world, getPlayerBB(pos).offset(dx, -1.0, dz)).length === 0; oldVelZ = dz) {
        if (dx < step && dx >= -step) dx = 0
        else if (dx > 0) dx -= step
        else dx += step

        // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/Entity.java#L679
        oldVelX = dx

        if (dz < step && dz >= -step) dz = 0
        else if (dz > 0) dz -= step
        else dz += step
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

    const onGroundFlag = (playerState.onGround || (oldVelY !== dy && oldVelY < 0))

    // Step on block if height < stepHeight
    if (physics.stepHeight > 0 && onGroundFlag && (oldVelX !== dx || oldVelZ !== dz)) {
      const oldVelXCol = dx
      const oldVelYCol = dy
      const oldVelZCol = dz
      const AABB3 = playerBB.clone()
      dy = physics.stepHeight

      const surroundingBBs = getSurroundingBBs(world, oldBB.clone().extend(oldVelX, dy, oldVelZ))
      const AABB4 = oldBB.clone()
      const AABB5 = AABB4.clone().extend(oldVelX, 0, oldVelZ)

      let dy1 = dy
      for (const blockBB of surroundingBBs) {
        dy1 = blockBB.computeOffsetY(AABB5, dy1)
      }
      AABB4.offset(0, dy1, 0)

      let dx1 = oldVelX
      for (const blockBB of surroundingBBs) {
        dx1 = blockBB.computeOffsetX(AABB4, dx1)
      }
      AABB4.offset(dx1, 0, 0)

      let dz1 = oldVelZ
      for (const blockBB of surroundingBBs) {
        dz1 = blockBB.computeOffsetZ(AABB4, dz1)
      }
      AABB4.offset(0, 0, dz1)

      const AABB14 = oldBB.clone()

      let dy2 = dy
      for (const blockBB of surroundingBBs) {
        dy2 = blockBB.computeOffsetY(AABB14, dy2)
      }
      AABB14.offset(0, dy2, 0)

      let dx2 = oldVelX
      for (const blockBB of surroundingBBs) {
        dx2 = blockBB.computeOffsetX(AABB14, dx2)
      }
      AABB14.offset(dx2, 0, 0)

      let dz2 = oldVelZ
      for (const blockBB of surroundingBBs) {
        dz2 = blockBB.computeOffsetZ(AABB14, dz2)
      }
      AABB14.offset(0, 0, dz2)

      // compliance: javadouble mult
      const norm1 = dx1 * dx1 + dz1 * dz1
      const norm2 = dx2 * dx2 + dz2 * dz2

      if (norm1 > norm2) {
        dx = dx1
        dz = dz1
        dy = -dy1
        playerBB = AABB4
      } else {
        dx = dx2
        dz = dz2
        dy = -dy2
        playerBB = AABB14
      }
      for (const blockBB of surroundingBBs) {
        dy = blockBB.computeOffsetY(playerBB, dy)
      }
      playerBB.offset(0, dy, 0)

      // compliance: javadouble mult
      if (oldVelXCol * oldVelXCol + oldVelZCol * oldVelZCol >= dx * dx + dz * dz) {
        dx = oldVelXCol
        dy = oldVelYCol
        dz = oldVelZCol
        playerBB = AABB3
      }
    }

    // Update position (finally!)
    resetPositionToBB(playerBB, pos)

    playerState.isCollidedHorizontally = dx !== oldVelX || dz !== oldVelZ
    playerState.isCollidedVertically = dy !== oldVelY
    playerState.onGround = playerState.isCollidedVertically && oldVelY < 0

    let blockPos = pos.offset(0, -0.2, 0).floored()
    let blockAtFeet = world.getBlock(blockPos)

    if (blockAtFeet?.type === 0) {
      const downBlock = world.getBlock(blockPos.offset(0, -1, 0))

      if (wallIds.has(downBlock.type) || fenceIds.has(downBlock.type) || fenceGateIds.has(downBlock.type)) {
        blockAtFeet = downBlock
      }
    }

    // check if a collision happened in any of these directions
    if (dx !== oldVelX) {
      motion.x = 0.0
    }
    if (dz !== oldVelZ) {
      motion.z = 0.0
    }
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

  function doBlockCollisions (playerState) {
    const { motion, pos } = playerState
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
            } else if (block.type === webId) {
              playerState.isInWeb = true
            }
          }
        }
      }
    }
  }

  // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/Entity.java#L1224
  function moveFlying (playerState, moveStrafe, moveForward, friction) {
    const { motion } = playerState

    const speedSquared = f32add(f32mul(moveStrafe, moveStrafe), f32mul(moveForward, moveForward))

    if (speedSquared >= physics.negligeableFlyingSpeed) {
      let speed = f32(Math.sqrt(speedSquared))
      if (speed < f32(1.0)) {
        speed = f32(1.0)
      }
      speed = f32div(friction, speed)
      moveStrafe = f32mul(moveStrafe, speed)
      moveForward = f32mul(moveForward, speed)

      const sin = f32sin(f32mul(playerState.yawDegrees, DEG_TO_RAD))
      const cos = f32cos(f32mul(playerState.yawDegrees, DEG_TO_RAD))
      // compliance: can do += and -= here, because it also takes the double representation of the f32mul
      motion.x += f32sub(f32mul(moveStrafe, cos), f32mul(moveForward, sin))
      motion.z += f32add(f32mul(moveForward, cos), f32mul(moveStrafe, sin))
    }
  }

  function isOnLadder (world, pos) {
    const block = world.getBlock(pos)
    if (!block) {
      return false
    }
    return block.type === ladderId || block.type === vineId

  }

  function isOffsetPositionInLiquid (world, pos) {
    const pBB = getPlayerBB(pos)
    return !getSurroundingBBs(world, pBB).some(x => pBB.intersects(x))
      // any materialliquid, which is lava and water
      && !isMaterialInBB(world, pBB, liquidIds)
  }

  function moveEntityWithHeading (playerState, world, strafe, forward) {
    const { motion, pos } = playerState

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

    const isSprintingApplicable = forward > 0 && !playerState.control.sneak && !playerState.isInWater && !playerState.isInLava
    if (playerState.control.sprint && isSprintingApplicable && !attribute.checkAttributeModifier(playerSpeedAttribute, physics.sprintingUUID)) {
      playerSpeedAttribute = attribute.addAttributeModifier(playerSpeedAttribute, {
        uuid: physics.sprintingUUID,
        amount: physics.sprintSpeed,
        operation: 2
      })
    }

    const attributeSpeed = f32(attribute.getAttributeValue(playerSpeedAttribute))

    if (playerState.isInWater) {
      // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/EntityLivingBase.java#L1701
      const lastY = pos.y
      let inertia = physics.waterInertia
      let acceleration = physics.baseLiquidAcceleration
      let strider = f32(Math.min(playerState.depthStrider, 3))

      if (!playerState.onGround) {
        strider = f32mul(strider, physics.striderConstant)
      }

      if (strider > 0.0) {
        inertia = f32add(inertia,
          f32div(f32mul(f32sub(physics.magicFrictionWater, inertia), strider), f32(3.0))
        )
        acceleration = f32add(acceleration,
          f32div(f32mul(f32sub(attributeSpeed, acceleration), strider), f32(3.0))
        )
      }

      moveFlying(playerState, strafe, forward, acceleration)
      moveEntity(playerState, world, motion.x, motion.y, motion.z)

      motion.x *= inertia
      motion.y *= physics.waterInertia
      motion.z *= inertia
      motion.y -= physics.waterGravity
      if (playerState.isCollidedHorizontally && isOffsetPositionInLiquid(world, pos.offset(motion.x, motion.y + 0.6 - pos.y + lastY, motion.z))) {
        motion.y = physics.outOfLiquidImpulse
      }
    } else if (playerState.isInLava) {
      const lastY = pos.y
      moveFlying(playerState, strafe, forward, physics.baseLiquidAcceleration)
      moveEntity(playerState, world, motion.x, motion.y, motion.z)
      motion.x *= physics.lavaInertia
      motion.y *= physics.lavaInertia
      motion.z *= physics.lavaInertia
      motion.y *= physics.lavaGravity
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
        inertia = f32mul(slipperiness, physics.airborneInertia)
      }

      const accelerationScale = f32div(physics.magicFrictionCubed, f32mul(inertia, f32mul(inertia, inertia)))
      // todo: change attributespeed to be javafloat
      let acceleration
      if (playerState.onGround) {
        acceleration = f32mul(attributeSpeed, accelerationScale)
      } else {
        // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/player/EntityPlayer.java#L631
        let jumpMovementFactor = physics.airborneAcceleration
        const isSprintingApplicable = forward > 0 && !playerState.control.sneak && !playerState.isInWater && !playerState.isInLava
        if (playerState.control.sprint && isSprintingApplicable) {
          jumpMovementFactor = f32(
            jumpMovementFactor + physics.airborneAcceleration * 0.3
          )
        }
        acceleration = jumpMovementFactor
      }

      moveFlying(playerState, strafe, forward, acceleration)

      if (isOnLadder(world, pos)) {
        motion.x = clamp(-physics.ladderMaxSpeed, motion.x, physics.ladderMaxSpeed)
        motion.z = clamp(-physics.ladderMaxSpeed, motion.z, physics.ladderMaxSpeed)
        if (motion.y < -physics.ladderClimbSpeed) {
          // clone it
          motion.y = -physics.ladderClimbSpeed
        }
        if (playerState.control.sneak && motion.y < 0) {
          motion.y = 0
        }
      }

      moveEntity(playerState, world, motion.x, motion.y, motion.z)

      if (isOnLadder(world, pos) && (playerState.isCollidedHorizontally)) {
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
      motion.x *= inertia
      motion.z *= inertia
    }
  }

  function isMaterialInBB (world, queryBB, types) {
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

  function getLiquidHeightPcent (block) {
    return (getRenderedDepth(block) + 1) / 9
  }

  function getRenderedDepth (block) {
    if (!block) return -1
    if (block.isWaterlogged) return 0
    if (!waterIds.includes(block.type)) return -1
    const meta = block.metadata
    return meta >= 8 ? 0 : meta
  }

  function getFlow (world, block) {
    const pos = block.position
    const curLevel = getRenderedDepth(block)
    const flow = new Vec3(0.0, 0.0, 0.0)

    const directions = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ]

    for (const [dx, dz] of directions) {
      const adjPos = pos.offset(dx, 0, dz)
      const adjBlock = world.getBlock(adjPos)
      let adjLevel = getRenderedDepth(adjBlock)

      if (adjLevel < 0) {
        // block is "solid" if it blocks movement (non-empty bbox)
        const adjBlockStateSolid = adjBlock && adjBlock.boundingBox !== 'empty'
        if (!adjBlockStateSolid) {
          const belowBlock = world.getBlock(adjPos.offset(0, -1, 0))
          adjLevel = getRenderedDepth(belowBlock)
          if (adjLevel >= 0) {
            const k = adjLevel - (curLevel - 8)
            flow.x += dx * k
            flow.z += dz * k
          }
        }
      } else {
        const l = adjLevel - curLevel
        flow.x += dx * l
        flow.z += dz * l
      }
    }

    // Falling water handling
    if (block.metadata >= 8) {
      for (const [dx, dz] of directions) {
        const side = pos.offset(dx, 0, dz)
        const sideUp = pos.offset(dx, 1, dz)
        const sideBlock = world.getBlock(side)
        const sideUpBlock = world.getBlock(sideUp)
        const solidSide = (sideBlock && sideBlock.boundingBox !== 'empty')
        const solidUp = (sideUpBlock && sideUpBlock.boundingBox !== 'empty')
        if (solidSide || solidUp) {
          flow.normalize()
          flow.y += -6.0
          break // only apply once!
        }
      }
    }

    return flow.normalize()
  }

  // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/world/World.java#L2077
  function isInWaterApplyCurrent (world, bb, motion) {
    const minX = Math.floor(bb.minX)
    const maxX = Math.floor(bb.maxX + 1)
    const minY = Math.floor(bb.minY)
    const maxY = Math.floor(bb.maxY + 1)
    const minZ = Math.floor(bb.minZ)
    const maxZ = Math.floor(bb.maxZ + 1)

    // Always assume area loaded
    let flag = false
    let vec3 = new Vec3(0.0, 0.0, 0.0)
    const cursor = new Vec3(0, 0, 0)

    for (cursor.x = minX; cursor.x < maxX; cursor.x++) {
      for (cursor.y = minY; cursor.y < maxY; cursor.y++) {
        for (cursor.z = minZ; cursor.z < maxZ; cursor.z++) {
          const block = world.getBlock(cursor)
          if (!block) continue
          if (waterIds.includes(block.type)) {
            const liquidHeight = (cursor.y + 1) - getLiquidHeightPcent(block)

            if (bb.maxY >= liquidHeight) {
              flag = true
              // equivalent to Block.modifyAcceleration(world, pos, entity, vec3)
              const flow = getFlow(world, block)
              vec3.add(flow)
            }
          }
        }
      }
    }

    // todo: technically, should check if entity.isPushedByWater (!this.capabilities.isFlying), but since flying is not implemented, ignore that part
    if (vec3.norm() > 0.0) {
      const normalized = vec3.normalize()
      motion.x += normalized.x * physics.flowConstant
      motion.y += normalized.y * physics.flowConstant
      motion.z += normalized.z * physics.flowConstant
    }

    return flag
  }

  return physics
}

module.exports = { Physics }

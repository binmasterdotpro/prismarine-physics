const { FENCES, WALLS, FENCE_GATES, FRICTION, FLUID_TAGS, FLUID_IDS } = require('./constants')
const { f32 } = require('./math')
const { Vec3I } = require('./vec')
const mcData = require('minecraft-data')('1.21.5')

// a representation of a physics engine block for this minecraft version
class Block {
  constructor (type, name, boundingBox, shapes, metadata, _properties) {
    this.type = type
    this.name = name
    this.boundingBox = boundingBox
    this.shapes = shapes
    this.metadata = metadata
    this.blockTags = generateTags(this.name)
    this.friction = generateFriction(this.name)
    this._properties = _properties
  }

  get position () {
    throw new Error('Block.position is not implemented in FastWorld.Block')
  }
}

const EMPTY_FLUID = new Block(-1, 'empty', 'empty', [], 0, {
  level: 0
})

function generateFriction (name) {
  if (name in FRICTION) {
    return FRICTION[name]
  }
  return f32(0.6)
}

// generate some useful physics-related block and fluid tags
function generateTags (name) {
  return {
    FENCE: FENCES.has(name),
    FENCE_GATE: FENCE_GATES.has(name),
    WALL: WALLS.has(name),
    WATER: FLUID_IDS.WATER.has(name),
    LAVA: FLUID_IDS.LAVA.has(name)
  }
}

// convert "metadata" to property values based on the provided bases
function decodeState (metadata, bases) {
  const values = {}
  for (let i = bases.length - 1; i >= 0; i--) {
    const state = bases[i]
    const base = state.num_values
    let output = metadata % base
    if (state.type === 'enum' || Array.isArray(state.values)) output = state.values[output]
    if (state.type === 'bool') output = !output
    values[state.name] = output
    metadata = Math.floor(metadata / base)
  }
  return values
}

// a fast implementation of only the parts of the prismarine world needed for physics
class FastWorld {
  static #stateToBlock = {}

  static {
    const shapes = mcData.blockCollisionShapes

    for (const stateId in mcData.blocksByStateId) {
      const block = mcData.blocksByStateId[stateId]
      const shapesId = shapes.blocks[block.name]
      const baseShape = (shapesId instanceof Array) ? shapes.shapes[shapesId[0]] : shapes.shapes[shapesId]
      const minStateId = block.minStateId
      const metadata = stateId - minStateId

      let blockShapes = baseShape
      if (shapesId instanceof Array) {
        blockShapes = shapes.shapes[shapesId[stateId - minStateId]]
      }

      if (!blockShapes) {
        console.warn(`No shape for block ${block.name}, stateId ${stateId}!`)
        blockShapes = [[0, 0, 0, 1, 1, 1]]
      }
      // equivalent to stateId % 16 or stateId - minStateId
      const _properties = decodeState(metadata, block.states)
      FastWorld.#stateToBlock[stateId] = new Block(
        block.id,
        block.name,
        block.boundingBox,
        blockShapes,
        metadata,
        _properties
      )
    }
  }

  constructor (bot) {
    this.bot = bot
  }

  isOutsideBuildHeight(pos) {
    // bot.game.minY = dimensionData.min_y
    // bot.game.height = dimensionData.height
    return pos.y < this.bot.game.minY || pos.y > (this.bot.game.minY + this.bot.game.height - 1)
  }

  //    public FluidState getFluidState(BlockPos var1) {
  //       if (this.isOutsideBuildHeight(var1)) {
  //          return Fluids.EMPTY.defaultFluidState();
  //       } else {
  //          LevelChunk var2 = this.getChunkAt(var1);
  //          return var2.getFluidState(var1);
  //       }
  //    }

  //    public FluidState getFluidState(int var1, int var2, int var3) {
  //       try {
  //          int var4 = this.getSectionIndex(var2);
  //          if (var4 >= 0 && var4 < this.sections.length) {
  //             LevelChunkSection var8 = this.sections[var4];
  //             if (!var8.hasOnlyAir()) {
  //                return var8.getFluidState(var1 & 15, var2 & 15, var3 & 15);
  //             }
  //          }
  //
  //          return Fluids.EMPTY.defaultFluidState();
  //       } catch (Throwable var7) {
  //          CrashReport var5 = CrashReport.forThrowable(var7, "Getting fluid state");
  //          CrashReportCategory var6 = var5.addCategory("Block being got");
  //          var6.setDetail("Location", (CrashReportDetail)(() -> CrashReportCategory.formatLocation(this, var1, var2, var3)));
  //          throw new ReportedException(var5);
  //       }
  //    }
  getFluidState(pos) {
    pos = pos instanceof Vec3I ? pos : Vec3I.fromVec3(pos)
    if (this.isOutsideBuildHeight(pos)) {
      return EMPTY_FLUID
    }
    const chunk = this.bot.world.getColumnAt(pos)
    if (!chunk) {
      console.warn('tried to get fluid state in unloaded chunk at', pos)
      return null
    }
    const section = chunk.getBlockStateId(pos)
    if (section === undefined) return EMPTY_FLUID
    const blockData = FastWorld.#stateToBlock[section]
    if (!blockData) throw new Error(`No block data for state ID ${section}`)
    // todo: check if this is the right behavior
    if (!blockData.blockTags.WATER && !blockData.blockTags.LAVA) {
      return EMPTY_FLUID
    }
    return blockData
  }

  //          try {
  //             int var5 = this.getSectionIndex(var3);
  //             if (var5 >= 0 && var5 < this.sections.length) {
  //                LevelChunkSection var10 = this.sections[var5];
  //                if (!var10.hasOnlyAir()) {
  //                   return var10.getBlockState(var2 & 15, var3 & 15, var4 & 15);
  //                }
  //             }
  //
  //             return Blocks.AIR.defaultBlockState();
  // seems to return AIR as default when section is missing or all air
  getBlockState (pos) {
    pos = pos instanceof Vec3I ? pos : Vec3I.fromVec3(pos)
    // should be void air default state, but air has the same properties... should be fine for now?
    if (this.isOutsideBuildHeight(pos)) return FastWorld.#stateToBlock[0]
    const chunk = this.bot.world.getColumnAt(pos)
    if (!chunk) {
      console.warn('tried to get block state in unloaded chunk at', pos)
      return null
    }
    const section = chunk.getBlockStateId(pos)
    if (section === undefined) return FastWorld.#stateToBlock[0]
    const blockData = FastWorld.#stateToBlock[section]
    if (!blockData) throw new Error(`No block data for state ID ${section}`)
    return blockData
  }

  hasChunkAt (pos) {
    pos = pos instanceof Vec3I ? pos : Vec3I.fromVec3(pos)
    const chunkX = pos.x >> 4
    const chunkZ = pos.z >> 4
    return this.bot.world.getColumnAt(chunkX, chunkZ) !== null
  }
}

module.exports = {
  FastWorld,
}
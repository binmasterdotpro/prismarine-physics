const mcData = require('minecraft-data')('1.21.5')
const prismarineBlock = require('prismarine-block')('1.21.5')

// a representation of a block for this minecraft version
class Block {
  constructor (type, boundingBox, shapes, metadata, _properties) {
    this.type = type
    this.boundingBox = boundingBox
    this.shapes = shapes
    this.metadata = metadata
    this._properties = _properties
  }
}

// convert "metadata" to property values based on the provided bases
function decodeState(metadata, bases) {
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

  getBlock (pos) {
    pos = pos.floored()
    const chunk = this.bot.world.getColumnAt(pos)
    if (!chunk) return null
    const section = chunk.getBlockStateId(pos)
    if (section === undefined) return null
    const blockData = FastWorld.#stateToBlock[section]
    if (!blockData) throw new Error(`No block data for state ID ${section}`)
    return {
      block: blockData,
      position: pos,
    }
  }
}

module.exports = {
  FastWorld,
}
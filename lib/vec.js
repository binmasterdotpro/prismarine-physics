const assert = require('node:assert')

const { Vec3 } = require('vec3')
const { f32 } = require('./math')

class Vec3I extends Vec3 {
  constructor (...args) {
    assert(args.length === 3, `VecI must be constructed with 3 arguments, got ${args.length}`)
    for (const arg of args) {
      assert(Number.isInteger(arg), `All arguments to VecI must be integers, got ${arg}`)
    }
    super(...args)
  }

  static fromVec3 (vec) {
    return new Vec3I(Math.floor(vec.x), Math.floor(vec.y), Math.floor(vec.z))
  }

  distToCenterSqr(x, y, z) {
    const dx = this.x + 0.5 - x;
    const dy = this.y + 0.5 - y;
    const dz = this.z + 0.5 - z;
    return dx * dx + dy * dy + dz * dz;
  }
}

class Vec3F extends Vec3 {
  constructor (...args) {
    assert(args.length === 3, `VecF must be constructed with 3 arguments, got ${args.length}`)
    for (const arg of args) {
      assert(typeof arg === 'number', `All arguments to VecF must be numbers, got ${arg}`)
    }
    for (let i = 0; i < args.length; i++) {
      args[i] = f32(args[i])
    }
    super(...args)
  }
}

module.exports = {
  Vec3I,
  Vec3F
}
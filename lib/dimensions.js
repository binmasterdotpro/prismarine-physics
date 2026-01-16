// package net.minecraft.world.entity;
//
// import net.minecraft.world.phys.AABB;
// import net.minecraft.world.phys.Vec3;
//
// public record EntityDimensions(float width, float height, float eyeHeight, EntityAttachments attachments, boolean fixed) {
//    private EntityDimensions(float var1, float var2, boolean var3) {
//       this(var1, var2, defaultEyeHeight(var2), EntityAttachments.createDefault(var1, var2), var3);
//    }
//
//    public EntityDimensions(float var1, float var2, float var3, EntityAttachments var4, boolean var5) {
//       super();
//       this.width = var1;
//       this.height = var2;
//       this.eyeHeight = var3;
//       this.attachments = var4;
//       this.fixed = var5;
//    }
//
//    private static float defaultEyeHeight(float var0) {
//       return var0 * 0.85F;
//    }
//
//    public AABB makeBoundingBox(Vec3 var1) {
//       return this.makeBoundingBox(var1.x, var1.y, var1.z);
//    }
//
//    public AABB makeBoundingBox(double var1, double var3, double var5) {
//       float var7 = this.width / 2.0F;
//       float var8 = this.height;
//       return new AABB(var1 - (double)var7, var3, var5 - (double)var7, var1 + (double)var7, var3 + (double)var8, var5 + (double)var7);
//    }
//
//    public EntityDimensions scale(float var1) {
//       return this.scale(var1, var1);
//    }
//
//    public EntityDimensions scale(float var1, float var2) {
//       return !this.fixed && (var1 != 1.0F || var2 != 1.0F) ? new EntityDimensions(this.width * var1, this.height * var2, this.eyeHeight * var2, this.attachments.scale(var1, var2, var1), false) : this;
//    }
//
//    public static EntityDimensions scalable(float var0, float var1) {
//       return new EntityDimensions(var0, var1, false);
//    }
//
//    public static EntityDimensions fixed(float var0, float var1) {
//       return new EntityDimensions(var0, var1, true);
//    }
//
//    public EntityDimensions withEyeHeight(float var1) {
//       return new EntityDimensions(this.width, this.height, var1, this.attachments, this.fixed);
//    }
//
//    public EntityDimensions withAttachments(EntityAttachments.Builder var1) {
//       return new EntityDimensions(this.width, this.height, this.eyeHeight, var1.build(this.width, this.height), this.fixed);
//    }
// }

// package net.minecraft.world.entity;
//
// import java.util.ArrayList;
// import java.util.EnumMap;
// import java.util.List;
// import java.util.Map;
// import javax.annotation.Nullable;
// import net.minecraft.Util;
// import net.minecraft.util.Mth;
// import net.minecraft.world.phys.Vec3;
//
// public class EntityAttachments {
//    private final Map<EntityAttachment, List<Vec3>> attachments;
//
//    EntityAttachments(Map<EntityAttachment, List<Vec3>> var1) {
//       super();
//       this.attachments = var1;
//    }
//
//    public static EntityAttachments createDefault(float var0, float var1) {
//       return builder().build(var0, var1);
//    }
//
//    public static Builder builder() {
//       return new Builder();
//    }
//
//    public EntityAttachments scale(float var1, float var2, float var3) {
//       return new EntityAttachments(Util.makeEnumMap(EntityAttachment.class, (var4) -> {
//          ArrayList var5 = new ArrayList();
//
//          for(Vec3 var7 : (List)this.attachments.get(var4)) {
//             var5.add(var7.multiply((double)var1, (double)var2, (double)var3));
//          }
//
//          return var5;
//       }));
//    }
//
//    @Nullable
//    public Vec3 getNullable(EntityAttachment var1, int var2, float var3) {
//       List var4 = (List)this.attachments.get(var1);
//       return var2 >= 0 && var2 < var4.size() ? transformPoint((Vec3)var4.get(var2), var3) : null;
//    }
//
//    public Vec3 get(EntityAttachment var1, int var2, float var3) {
//       Vec3 var4 = this.getNullable(var1, var2, var3);
//       if (var4 == null) {
//          String var10002 = String.valueOf(var1);
//          throw new IllegalStateException("Had no attachment point of type: " + var10002 + " for index: " + var2);
//       } else {
//          return var4;
//       }
//    }
//
//    public Vec3 getClamped(EntityAttachment var1, int var2, float var3) {
//       List var4 = (List)this.attachments.get(var1);
//       if (var4.isEmpty()) {
//          throw new IllegalStateException("Had no attachment points of type: " + String.valueOf(var1));
//       } else {
//          Vec3 var5 = (Vec3)var4.get(Mth.clamp(var2, 0, var4.size() - 1));
//          return transformPoint(var5, var3);
//       }
//    }
//
//    private static Vec3 transformPoint(Vec3 var0, float var1) {
//       return var0.yRot(-var1 * 0.017453292F);
//    }
//
//    public static class Builder {
//       private final Map<EntityAttachment, List<Vec3>> attachments = new EnumMap(EntityAttachment.class);
//
//       Builder() {
//          super();
//       }
//
//       public Builder attach(EntityAttachment var1, float var2, float var3, float var4) {
//          return this.attach(var1, new Vec3((double)var2, (double)var3, (double)var4));
//       }
//
//       public Builder attach(EntityAttachment var1, Vec3 var2) {
//          ((List)this.attachments.computeIfAbsent(var1, (var0) -> new ArrayList(1))).add(var2);
//          return this;
//       }
//
//       public EntityAttachments build(float var1, float var2) {
//          Map var3 = Util.makeEnumMap(EntityAttachment.class, (var3x) -> {
//             List var4 = (List)this.attachments.get(var3x);
//             return var4 == null ? var3x.createFallbackPoints(var1, var2) : List.copyOf(var4);
//          });
//          return new EntityAttachments(var3);
//       }
//    }
// }


const { f32, f32mul, f32div } = require('./math')
const AABB = require('./aabb')
const { Vec3 } = require('vec3')
const assert = require('node:assert')


// package net.minecraft.world.entity;
//
// import java.util.List;
// import net.minecraft.world.phys.Vec3;
//
// public enum EntityAttachment {
//    PASSENGER(EntityAttachment.Fallback.AT_HEIGHT),
//    VEHICLE(EntityAttachment.Fallback.AT_FEET),
//    NAME_TAG(EntityAttachment.Fallback.AT_HEIGHT),
//    WARDEN_CHEST(EntityAttachment.Fallback.AT_CENTER);
//
//    private final Fallback fallback;
//
//    private EntityAttachment(final Fallback var3) {
//       this.fallback = var3;
//    }
//
//    public List<Vec3> createFallbackPoints(float var1, float var2) {
//       return this.fallback.create(var1, var2);
//    }
//
//    // $FF: synthetic method
//    private static EntityAttachment[] $values() {
//       return new EntityAttachment[]{PASSENGER, VEHICLE, NAME_TAG, WARDEN_CHEST};
//    }
//
//    public interface Fallback {
//       List<Vec3> ZERO = List.of(Vec3.ZERO);
//       Fallback AT_FEET = (var0, var1) -> ZERO;
//       Fallback AT_HEIGHT = (var0, var1) -> List.of(new Vec3(0.0, (double)var1, 0.0));
//       Fallback AT_CENTER = (var0, var1) -> List.of(new Vec3(0.0, (double)var1 / 2.0, 0.0));
//
//       List<Vec3> create(float var1, float var2);
//    }
// }

const FALLBACK_TYPES = {
  AT_HEIGHT: (width, height) => {
    height = f32(height)
    new Vec3(0.0, height, 0.0)
  },
  AT_FEET: (width, height) => {
    new Vec3(0.0, 0.0, 0.0)
  },
  AT_CENTER: (width, height) => {
    height = f32(height)
    new Vec3(0.0, height / 2, 0.0)
  }
}

const ENTITY_ATTACHMENTS = {
  PASSENGER: 'PASSENGER',
  VEHICLE: 'VEHICLE',
  NAME_TAG: 'NAME_TAG',
  WARDEN_CHEST: 'WARDEN_CHEST'
}

const ENTITY_ATTACHMENT_FALLBACK = {
  PASSENGER: FALLBACK_TYPES.AT_HEIGHT,
  VEHICLE: FALLBACK_TYPES.AT_FEET,
  NAME_TAG: FALLBACK_TYPES.AT_HEIGHT,
  WARDEN_CHEST: FALLBACK_TYPES.AT_CENTER
}

class EntityAttachments {
  // Map<EntityAttachment, List<Vec3>>
  constructor(attachments) {
    if (!attachments) {
      this.attachments = new Map();
    }
    this.attachments = attachments;
  }

  // float, float, float
  scale(scaleX, scaleY, scaleZ) {
    scaleX = f32(scaleX);
    scaleY = f32(scaleY);
    scaleZ = f32(scaleZ);
    const newAttachments = new Map();
    for (const [attachment, points] of this.attachments.entries()) {
      const newPoints = points.map(point => new Vec3(
        // fp accuracy: the float is casted to a double in the multiplication
        point.x * scaleX,
        point.y * scaleY,
        point.z * scaleZ
      ))
      newAttachments.set(attachment, newPoints);
    }
    return new EntityAttachments(newAttachments);
  }

  static builder() {

  }

  static createWithAttachments(attachments, width, height) {
    width = f32(width);
    height = f32(height);
    const defaultAttachments = new Map();
    for (const attachment in ENTITY_ATTACHMENTS) {
      if (attachments.has(attachment)) {
        defaultAttachments.set(attachment, attachments.get(attachment));
        continue;
      }
      const point = ENTITY_ATTACHMENT_FALLBACK[attachment](width, height);
      defaultAttachments.set(attachment, [point]);
    }
    return new EntityAttachments(defaultAttachments);
  }

  static createDefault(width, height) {
    //          Map var3 = Util.makeEnumMap(EntityAttachment.class, (var3x) -> {
    //             List var4 = (List)this.attachments.get(var3x);
    //             return var4 == null ? var3x.createFallbackPoints(var1, var2) : List.copyOf(var4);
    //          });
    //          return new EntityAttachments(var3);
    width = f32(width);
    height = f32(height);
    const defaultAttachments = new Map();
    for (const attachment in ENTITY_ATTACHMENT) {
      const point = ENTITY_ATTACHMENT[attachment](width, height);
      defaultAttachments.set(attachment, [point]);
    }
    return new EntityAttachments(defaultAttachments);
  }
}

class EntityDimensions {
  // float, float, float, EntityAttachments, boolean
  constructor(width, height, eyeHeight, attachments, fixed) {
    assert(attachments instanceof EntityAttachments);
    this.width = f32(width);
    this.height = f32(height);
    this.eyeHeight = f32(eyeHeight);
    this.attachments = attachments;
    this.fixed = fixed;
  }

  makeBoundingBox(position) {
    const halfWidth = f32div(this.width, f32(2.0))
    return new AABB(
      // fp accuracy: the float is casted to a double in the AABB constructor
      position.x - halfWidth,
      position.y,
      position.z - halfWidth,
      position.x + halfWidth,
      position.y + this.height,
      position.z + halfWidth
    )
  }

  // float, float
  scale(scaleWidth, scaleHeight) {
    scaleWidth = f32(scaleWidth);
    scaleHeight = f32(scaleHeight);
    if (!this.fixed && (scaleWidth !== f32(1.0) || scaleHeight !== f32(1.0))) {
      return new EntityDimensions(
        f32mul(this.width, scaleWidth),
        f32mul(this.height, scaleHeight),
        f32mul(this.eyeHeight, scaleHeight),
        this.attachments.scale(scaleWidth, scaleHeight, scaleWidth),
        false
      );
    }
    return this;
  }

  static scalable(width, height) {
    width = f32(width);
    height = f32(height);
    return new EntityDimensions(width, height, f32mul(height, f32(0.85)), EntityAttachments.createDefault(width, height), false);
  }

  static fixed(width, height) {
    return new EntityDimensions(width, height, f32mul(height, f32(0.85)), EntityAttachments.createDefault(width, height), true);
  }

  withEyeHeight(eyeHeight) {
    return new EntityDimensions(this.width, this.height, f32(eyeHeight), this.attachments, this.fixed);
  }

  withAttachments(attachments) {
    assert(attachments instanceof EntityAttachments, 'attachments must be an instance of EntityAttachments');
    return new EntityDimensions(this.width, this.height, this.eyeHeight, attachments, this.fixed);
  }
}

module.exports = {
  EntityDimensions,
  EntityAttachments,
  ENTITY_ATTACHMENTS
}

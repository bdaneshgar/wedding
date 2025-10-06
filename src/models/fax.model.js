const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const faxSchema = mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    subscribed: {
      type: Boolean,
      default: true,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

faxSchema.plugin(toJSON);

const Fax = mongoose.model('Fax', faxSchema);
module.exports = Fax;
const _ = require("lodash");
const { promisify } = require("util");
const fnArgs = require('fn-args');

const status = require("./status");
const migrationsDir = require("../env/migrationsDir");
const changelog = require("../env/changelog");
const hasCallback = require('../utils/has-callback');

module.exports = async (db, client) => {
  const downgraded = [];
  const statusItems = await status(db);
  const appliedItems = statusItems.filter(item => item.appliedAt !== "PENDING");
  const lastAppliedItem = _.last(appliedItems);

  if (lastAppliedItem) {
    try {
      const migration = await migrationsDir.loadMigration(lastAppliedItem.fileName);
      const down = hasCallback(migration.down) ? promisify(migration.down) : migration.down;

      if (hasCallback(migration.down) && fnArgs(migration.down).length < 3) {
        // support old callback-based migrations prior to migrate-mongo 7.x.x
        await down(db);
      } else {
        await down(db, client);
      }

      downgraded.push(lastAppliedItem.fileName);
      await changelog.downgraded(db, lastAppliedItem.fileName);
    } catch (err) {
      throw new Error(
        `Could not migrate down ${lastAppliedItem.fileName}: ${err.message}`
      );
    }
  }

  return downgraded;
};

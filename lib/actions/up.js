const _ = require("lodash");
const pEachSeries = require("p-each-series");
const { promisify } = require("util");
const fnArgs = require('fn-args');

const status = require("./status");
const migrationsDir = require("../env/migrationsDir");
const changelog = require("../env/changelog");
const hasCallback = require('../utils/has-callback');

module.exports = async (db, client) => {
  const statusItems = await status(db);
  const pendingItems = _.filter(statusItems, { appliedAt: "PENDING" });
  const migrated = [];

  const migrateItem = async item => {
    try {
      const migration = await migrationsDir.loadMigration(item.fileName);
      const up = hasCallback(migration.up) ? promisify(migration.up) : migration.up;

      if (hasCallback(migration.up) && fnArgs(migration.up).length < 3) {
        // support old callback-based migrations prior to migrate-mongo 7.x.x
        await up(db);
      } else {
        await up(db, client);
      }
      
      migrated.push(item.fileName);
      await changelog.migrated(db, item.fileName);
    } catch (err) {
      const error = new Error(
        `Could not migrate up ${item.fileName}: ${err.message}`
      );
      error.migrated = migrated;
      throw error;
    }
  };

  await pEachSeries(pendingItems, migrateItem);
  return migrated;
};

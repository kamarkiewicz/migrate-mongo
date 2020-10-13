const { expect } = require("chai");
const sinon = require("sinon");

const proxyquire = require("proxyquire");

describe("down", () => {
  let down;
  let status;
  let migrationsDir;
  let changelog;
  let db;
  let client;
  let migration;

  function mockStatus() {
    return sinon.stub().returns(
      Promise.resolve([
        {
          fileName: "20160609113224-first_migration.js",
          appliedAt: new Date()
        },
        {
          fileName: "20160609113225-last_migration.js",
          appliedAt: new Date()
        }
      ])
    );
  }

  function mockMigrationsDir() {
    return {
      loadMigration: sinon.stub().returns(Promise.resolve(migration))
    };
  }

  function mockChangelog() {
    return {
      downgraded: sinon.stub().returns(Promise.resolve())
    };
  }

  function mockDb() {
    return { the: 'db' };
  }

  function mockClient() {
    return { the: 'client' };
  }

  function mockMigration() {
    const theMigration = {
      down: sinon.stub()
    };
    theMigration.down.returns(Promise.resolve());
    return theMigration;
  }

  function loadDownWithInjectedMocks() {
    return proxyquire("../../lib/actions/down", {
      "./status": status,
      "../env/migrationsDir": migrationsDir,
      "../env/changelog": changelog
    });
  }

  beforeEach(() => {
    migration = mockMigration();

    status = mockStatus();
    migrationsDir = mockMigrationsDir();
    changelog = mockChangelog();
    db = mockDb();
    client = mockClient();

    down = loadDownWithInjectedMocks();
  });

  it("should fetch the status", async () => {
    await down(db);
    expect(status.called).to.equal(true);
  });

  it("should yield empty list when nothing to downgrade", async () => {
    status.returns(
      Promise.resolve([
        { fileName: "20160609113224-some_migration.js", appliedAt: "PENDING" }
      ])
    );
    const migrated = await down(db);
    expect(migrated).to.deep.equal([]);
  });

  it("should load the last applied migration", async () => {
    await down(db);
    expect(migrationsDir.loadMigration.getCall(0).args[0]).to.equal(
      "20160609113225-last_migration.js"
    );
  });

  it("should downgrade the last applied migration", async () => {
    await down(db);
    expect(migration.down.called).to.equal(true);
  });

  it("should be able to downgrade callback based migration that has both the `db` and `client` arguments", async () => {
    migration = {
      down(theDb, theClient, callback) {
        return callback();
      }
    };
    migrationsDir = mockMigrationsDir();
    down = loadDownWithInjectedMocks();
    await down(db, client);
  });

  it("should be able to downgrade callback based migration that has only the `db` argument", async () => {
    migration = {
      down(theDb, callback) {
        return callback();
      }
    };
    migrationsDir = mockMigrationsDir();
    down = loadDownWithInjectedMocks();
    await down(db);
  });

  it("should allow downgrade to return promise", async () => {
    migrationsDir = mockMigrationsDir();
    down = loadDownWithInjectedMocks();
    await down(db);
    expect(migration.down.called).to.equal(true);
  });

  it("should yield an error when an error occurred during the downgrade", async () => {
    migration.down.returns(Promise.reject(new Error("Invalid syntax")));
    try {
      await down(db);
      expect.fail("Error was not thrown");
    } catch (err) {
      expect(err.message).to.equal(
        "Could not migrate down 20160609113225-last_migration.js: Invalid syntax"
      );
    }
  });

  it("should notify changelog about the downgraded migration", async () => {
    await down(db);
    expect(changelog.downgraded.called).to.equal(true);
    expect(changelog.downgraded.callCount).to.equal(1);
  });

  it("should yield errors that occurred when notifying the changelog", async () => {
    changelog.downgraded.returns(
      Promise.reject(new Error("Could not delete"))
    );
    try {
      await down(db);
    } catch (err) {
      expect(err.message).to.equal(
        "Could not migrate down 20160609113225-last_migration.js: Could not delete"
      );
    }
  });

  it("should yield a list of downgraded items", async () => {
    const items = await down(db);
    expect(items).to.deep.equal(["20160609113225-last_migration.js"]);
  });
});

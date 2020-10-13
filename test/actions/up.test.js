const { expect } = require("chai");
const sinon = require("sinon");

const proxyquire = require("proxyquire");

describe("up", () => {
  let up;
  let status;
  let migrationsDir;
  let changelog;
  let db;
  let client;

  let firstPendingMigration;
  let secondPendingMigration;

  function mockStatus() {
    return sinon.stub().returns(
      Promise.resolve([
        {
          fileName: "20160605123224-first_applied_migration.js",
          appliedAt: new Date()
        },
        {
          fileName: "20160606093207-second_applied_migration.js",
          appliedAt: new Date()
        },
        {
          fileName: "20160607173840-first_pending_migration.js",
          appliedAt: "PENDING"
        },
        {
          fileName: "20160608060209-second_pending_migration.js",
          appliedAt: "PENDING"
        }
      ])
    );
  }

  function mockMigrationsDir() {
    const mock = {};
    mock.loadMigration = sinon.stub();
    mock.loadMigration
      .withArgs("20160607173840-first_pending_migration.js")
      .returns(Promise.resolve(firstPendingMigration));
    mock.loadMigration
      .withArgs("20160608060209-second_pending_migration.js")
      .returns(Promise.resolve(secondPendingMigration));
    return mock;
  }

  function mockChangelog() {
    return {
      migrated: sinon.stub().returns(Promise.resolve())
    };
  }

  function mockDb() {
    return { the: 'db' };
  }

  function mockClient() {
    return { the: 'client' };
  }

  function mockMigration() {
    const migration = {
      up: sinon.stub()
    };
    migration.up.returns(Promise.resolve());
    return migration;
  }

  function loadUpWithInjectedMocks() {
    return proxyquire("../../lib/actions/up", {
      "./status": status,
      "../env/migrationsDir": migrationsDir,
      "../env/changelog": changelog
    });
  }

  beforeEach(() => {
    firstPendingMigration = mockMigration();
    secondPendingMigration = mockMigration();

    status = mockStatus();
    migrationsDir = mockMigrationsDir();
    changelog = mockChangelog();
    db = mockDb();
    client = mockClient();

    up = loadUpWithInjectedMocks();
  });

  it("should fetch the status", async () => {
    await up(db);
    expect(status.called).to.equal(true);
  });

  it("should load all the pending migrations", async () => {
    await up(db);
    expect(migrationsDir.loadMigration.called).to.equal(true);
    expect(migrationsDir.loadMigration.callCount).to.equal(2);
    expect(migrationsDir.loadMigration.getCall(0).args[0]).to.equal(
      "20160607173840-first_pending_migration.js"
    );
    expect(migrationsDir.loadMigration.getCall(1).args[0]).to.equal(
      "20160608060209-second_pending_migration.js"
    );
  });

  it("should upgrade all pending migrations in ascending order", async () => {
    await up(db);
    expect(firstPendingMigration.up.called).to.equal(true);
    expect(secondPendingMigration.up.called).to.equal(true);
    sinon.assert.callOrder(firstPendingMigration.up, secondPendingMigration.up);
  });

  it("should be able to upgrade callback based migration that has both the `db` and `client` args", async () => {
    firstPendingMigration = {
      up(theDb, theClient, callback) {
        return callback();
      }
    };
    migrationsDir = mockMigrationsDir();
    up = loadUpWithInjectedMocks();
    await up(db, client);
  });

  it("should be able to upgrade callback based migration that has only the `db` arg", async () => {
    firstPendingMigration = {
      up(theDb, callback) {
        return callback();
      }
    };
    migrationsDir = mockMigrationsDir();
    up = loadUpWithInjectedMocks();
    await up(db, client);
  });

  it("should populate the changelog with info about the upgraded migrations", async () => {
    await up(db);
    expect(changelog.migrated.called).to.equal(true);
    expect(changelog.migrated.callCount).to.equal(2);
    expect(changelog.migrated.getCall(0).args).to.deep.equal([
      db, "20160607173840-first_pending_migration.js"
    ]);
  });

  it("should yield a list of upgraded migration file names", async () => {
    const upgradedFileNames = await up(db);
    expect(upgradedFileNames).to.deep.equal([
      "20160607173840-first_pending_migration.js",
      "20160608060209-second_pending_migration.js"
    ]);
  });

  it("should stop migrating when an error occurred and yield the error", async () => {
    secondPendingMigration.up.returns(Promise.reject(new Error("Nope")));
    try {
      await up(db);
      expect.fail("Error was not thrown");
    } catch (err) {
      expect(err.message).to.deep.equal(
        "Could not migrate up 20160608060209-second_pending_migration.js: Nope"
      );
    }
  });

  it("should yield an error + items already migrated when unable to update the changelog", async () => {
    changelog.migrated
      .onSecondCall()
      .returns(Promise.reject(new Error("Changelog failure")));
    try {
      await up(db);
      expect.fail("Error was not thrown");
    } catch (err) {
      expect(err.message).to.deep.equal(
        "Could not migrate up 20160608060209-second_pending_migration.js: Changelog failure"
      );
      expect(err.migrated).to.deep.equal([
        "20160607173840-first_pending_migration.js",
        "20160608060209-second_pending_migration.js"
      ]);
    }
  });
});

import {Command} from "commander";
import {vi, describe, beforeEach, afterEach, test, expect} from "vitest";
import {initializeStakingCommands} from "../../src/commands/staking";
import {ValidatorJoinAction} from "../../src/commands/staking/validatorJoin";
import {ValidatorDepositAction} from "../../src/commands/staking/validatorDeposit";
import {ValidatorExitAction} from "../../src/commands/staking/validatorExit";
import {ValidatorClaimAction} from "../../src/commands/staking/validatorClaim";
import {DelegatorJoinAction} from "../../src/commands/staking/delegatorJoin";
import {DelegatorExitAction} from "../../src/commands/staking/delegatorExit";
import {DelegatorClaimAction} from "../../src/commands/staking/delegatorClaim";
import {StakingInfoAction} from "../../src/commands/staking/stakingInfo";

vi.mock("../../src/commands/staking/validatorJoin");
vi.mock("../../src/commands/staking/validatorDeposit");
vi.mock("../../src/commands/staking/validatorExit");
vi.mock("../../src/commands/staking/validatorClaim");
vi.mock("../../src/commands/staking/delegatorJoin");
vi.mock("../../src/commands/staking/delegatorExit");
vi.mock("../../src/commands/staking/delegatorClaim");
vi.mock("../../src/commands/staking/stakingInfo");

describe("staking commands", () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    initializeStakingCommands(program);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("validator-join", () => {
    test("calls ValidatorJoinAction.execute with amount", async () => {
      program.parse(["node", "test", "staking", "validator-join", "--amount", "42000gen"]);

      expect(ValidatorJoinAction).toHaveBeenCalledTimes(1);
      expect(ValidatorJoinAction.prototype.execute).toHaveBeenCalledWith({
        amount: "42000gen",
      });
    });

    test("calls ValidatorJoinAction.execute with operator", async () => {
      program.parse([
        "node",
        "test",
        "staking",
        "validator-join",
        "--amount",
        "42000gen",
        "--operator",
        "0xOperator",
      ]);

      expect(ValidatorJoinAction.prototype.execute).toHaveBeenCalledWith({
        amount: "42000gen",
        operator: "0xOperator",
      });
    });

    test("accepts staking-address option", async () => {
      program.parse([
        "node",
        "test",
        "staking",
        "validator-join",
        "--amount",
        "42000",
        "--staking-address",
        "0xStaking",
      ]);

      expect(ValidatorJoinAction.prototype.execute).toHaveBeenCalledWith(
        expect.objectContaining({stakingAddress: "0xStaking"}),
      );
    });
  });

  describe("validator-deposit", () => {
    test("calls ValidatorDepositAction.execute", async () => {
      program.parse(["node", "test", "staking", "validator-deposit", "--amount", "1000gen"]);

      expect(ValidatorDepositAction).toHaveBeenCalledTimes(1);
      expect(ValidatorDepositAction.prototype.execute).toHaveBeenCalledWith({
        amount: "1000gen",
      });
    });
  });

  describe("validator-exit", () => {
    test("calls ValidatorExitAction.execute", async () => {
      program.parse(["node", "test", "staking", "validator-exit", "--shares", "100"]);

      expect(ValidatorExitAction).toHaveBeenCalledTimes(1);
      expect(ValidatorExitAction.prototype.execute).toHaveBeenCalledWith({
        shares: "100",
      });
    });
  });

  describe("validator-claim", () => {
    test("calls ValidatorClaimAction.execute", async () => {
      program.parse(["node", "test", "staking", "validator-claim", "--validator", "0xValidator"]);

      expect(ValidatorClaimAction).toHaveBeenCalledTimes(1);
      expect(ValidatorClaimAction.prototype.execute).toHaveBeenCalledWith({
        validator: "0xValidator",
      });
    });

    test("works without validator option", async () => {
      program.parse(["node", "test", "staking", "validator-claim"]);

      expect(ValidatorClaimAction.prototype.execute).toHaveBeenCalledWith({});
    });
  });

  describe("delegator-join", () => {
    test("calls DelegatorJoinAction.execute", async () => {
      program.parse([
        "node",
        "test",
        "staking",
        "delegator-join",
        "--validator",
        "0xValidator",
        "--amount",
        "42gen",
      ]);

      expect(DelegatorJoinAction).toHaveBeenCalledTimes(1);
      expect(DelegatorJoinAction.prototype.execute).toHaveBeenCalledWith({
        validator: "0xValidator",
        amount: "42gen",
      });
    });
  });

  describe("delegator-exit", () => {
    test("calls DelegatorExitAction.execute", async () => {
      program.parse([
        "node",
        "test",
        "staking",
        "delegator-exit",
        "--validator",
        "0xValidator",
        "--shares",
        "50",
      ]);

      expect(DelegatorExitAction).toHaveBeenCalledTimes(1);
      expect(DelegatorExitAction.prototype.execute).toHaveBeenCalledWith({
        validator: "0xValidator",
        shares: "50",
      });
    });
  });

  describe("delegator-claim", () => {
    test("calls DelegatorClaimAction.execute", async () => {
      program.parse([
        "node",
        "test",
        "staking",
        "delegator-claim",
        "--validator",
        "0xValidator",
        "--delegator",
        "0xDelegator",
      ]);

      expect(DelegatorClaimAction).toHaveBeenCalledTimes(1);
      expect(DelegatorClaimAction.prototype.execute).toHaveBeenCalledWith({
        validator: "0xValidator",
        delegator: "0xDelegator",
      });
    });
  });

  describe("validator-info", () => {
    test("calls StakingInfoAction.getValidatorInfo", async () => {
      program.parse(["node", "test", "staking", "validator-info", "--validator", "0xValidator"]);

      expect(StakingInfoAction).toHaveBeenCalledTimes(1);
      expect(StakingInfoAction.prototype.getValidatorInfo).toHaveBeenCalledWith({
        validator: "0xValidator",
      });
    });
  });

  describe("epoch-info", () => {
    test("calls StakingInfoAction.getEpochInfo", async () => {
      program.parse(["node", "test", "staking", "epoch-info"]);

      expect(StakingInfoAction).toHaveBeenCalledTimes(1);
      expect(StakingInfoAction.prototype.getEpochInfo).toHaveBeenCalledWith({});
    });
  });

  describe("active-validators", () => {
    test("calls StakingInfoAction.listActiveValidators", async () => {
      program.parse(["node", "test", "staking", "active-validators"]);

      expect(StakingInfoAction).toHaveBeenCalledTimes(1);
      expect(StakingInfoAction.prototype.listActiveValidators).toHaveBeenCalledWith({});
    });
  });
});

import {BaseAction} from "../../lib/actions/BaseAction";
import {ContractFeeCliOptions, FeeProfileTarget, parseFeeEstimateOptions, toTransactionFees} from "./fees";

export interface EstimateFeesOptions
  extends Pick<ContractFeeCliOptions, "fees" | "feeProfile" | "feePreset" | "appealRounds"> {
  args?: any[];
  rpc?: string;
  json?: boolean;
  includeReport?: boolean;
}

const toJsonSafe = (value: any): any => {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, toJsonSafe(item)]),
    );
  }
  return value;
};

const simulationFeeReport = (simulation: Record<string, any>): Record<string, any> | undefined =>
  simulation.feeReport ?? simulation.feeAccounting?.execution_fee_report;

const withSimulationReport = (estimate: unknown, simulation: unknown): unknown => {
  if (!simulation || typeof simulation !== "object" || Array.isArray(simulation)) {
    return estimate;
  }

  const simulationRecord = simulation as Record<string, any>;
  return {
    ...(estimate && typeof estimate === "object" && !Array.isArray(estimate)
      ? (estimate as Record<string, any>)
      : {estimate}),
    simulation: {
      feeAccounting: simulationRecord.feeAccounting,
      feeReport: simulationFeeReport(simulationRecord),
    },
  };
};

export class EstimateFeesAction extends BaseAction {
  constructor() {
    super();
  }

  async estimate({
    contractAddress,
    method,
    args,
    rpc,
    fees,
    feeProfile,
    feePreset,
    appealRounds,
    json,
    includeReport,
  }: EstimateFeesOptions & {
    contractAddress?: string;
    method?: string;
  }): Promise<void> {
    try {
      const client = await this.getClient(rpc, true);
      await client.initializeConsensusSmartContract();

      if (!json) this.startSpinner("Estimating transaction fees...");
      let estimate: unknown;

      if (contractAddress || method) {
        if (!contractAddress || !method) {
          this.failSpinner(
            "Both contractAddress and method are required for simulation-derived fee estimates.",
          );
          return;
        }

        const estimateOptions = parseFeeEstimateOptions(
          {fees, feeProfile, feePreset, appealRounds},
          {profileTarget: {kind: "method", method}},
        );
        if (!json) this.setSpinnerText(`Simulating ${method} on ${contractAddress}...`);
        if (!includeReport && typeof client.estimateTransactionFeesForWrite === "function") {
          estimate = await client.estimateTransactionFeesForWrite({
            ...(estimateOptions ?? {}),
            address: contractAddress as any,
            functionName: method,
            args: args ?? [],
          });
        } else {
          if (typeof client.simulateWriteContract !== "function") {
            this.failSpinner("The active genlayer-js client does not support write simulation.");
            return;
          }
          if (typeof client.estimateTransactionFeesFromSimulation !== "function") {
            this.failSpinner(
              "The active genlayer-js client does not support simulation-derived fee estimates.",
            );
            return;
          }

          const initialEstimate = await client.estimateTransactionFees(estimateOptions);
          const simulation = await client.simulateWriteContract({
            address: contractAddress as any,
            functionName: method,
            args: args ?? [],
            includeReceipt: true,
            fees: toTransactionFees(initialEstimate as Record<string, any>),
          });
          estimate = await client.estimateTransactionFeesFromSimulation({
            ...(estimateOptions ?? {}),
            simulation,
          });
          if (includeReport) {
            estimate = withSimulationReport(estimate, simulation);
          }
        }
      } else {
        if (includeReport) {
          this.failSpinner("--include-report requires both contractAddress and method.");
          return;
        }
        const profileTarget: FeeProfileTarget | undefined = feeProfile ? {kind: "deploy"} : undefined;
        const estimateOptions = parseFeeEstimateOptions(
          {fees, feeProfile, feePreset, appealRounds},
          {profileTarget},
        );
        estimate = await client.estimateTransactionFees(estimateOptions);
      }

      if (json) {
        console.log(JSON.stringify(toJsonSafe(estimate)));
      } else {
        this.succeedSpinner("Fee estimate generated", toJsonSafe(estimate));
      }
    } catch (error) {
      this.failSpinner("Error estimating transaction fees", error);
    }
  }
}

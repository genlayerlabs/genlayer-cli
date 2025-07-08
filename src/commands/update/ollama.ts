import Docker from "dockerode";
import { rpcClient } from "../../lib/clients/jsonRpcClient";
import { BaseAction } from "../../lib/actions/BaseAction";

export class OllamaAction extends BaseAction {
  private docker: Docker;

  constructor() {
    super();
    this.docker = new Docker();
  }

  async updateModel(modelName: string) {
    try {
      this.startSpinner(`Updating model "${modelName}"...`);

      if(!modelName){
        modelName = this.getConfig().defaultOllamaModel;
      }

      const providersAndModels = await rpcClient.request({
        method: "sim_getProvidersAndModels",
        params: [],
      });

      const existingOllamaProvider = providersAndModels.result.find(
        (entry: any) => entry.plugin === "ollama"
      );

      if (!existingOllamaProvider) {
        return this.failSpinner("No existing 'ollama' provider found. Unable to add/update a model.");
      }

      await this.executeModelCommand("pull", modelName, `Model "${modelName}" updated successfully`);

      const existingModel = providersAndModels.result.some(
        (entry: any) => entry.plugin === "ollama" && entry.model === modelName
      );
      if (!existingModel) {
        this.startSpinner(`Adding model "${modelName}" to Provider Presets...`);

        const newModelConfig = {
          config: existingOllamaProvider.config,
          model: modelName,
          plugin: "ollama",
          plugin_config: existingOllamaProvider.plugin_config,
          provider: "ollama",
        };

        await rpcClient.request({
          method: "sim_addProvider",
          params: [newModelConfig],
        });
        this.succeedSpinner(`Model "${modelName}" added to Provider Presets successfully.`);
      }
    } catch (error) {
      this.failSpinner(`Error updating model "${modelName}"`, error);
    }
  }

  async removeModel(modelName: string) {
    await this.executeModelCommand("rm", modelName, `Model "${modelName}" removed successfully`);
  }

  private async executeModelCommand(command: string, modelName: string, successMessage: string) {
    try {
      this.startSpinner(`Executing '${command}' command on model "${modelName}"...`);

      let success = false;
      const ollamaContainer = this.docker.getContainer("genlayer-ollama");
      const exec = await ollamaContainer.exec({
        Cmd: ["ollama", command, modelName],
        AttachStdout: true,
        AttachStderr: true,
      });
      const stream = await exec.start({ Detach: false, Tty: false });

      stream.on("data", (chunk: any) => {
        const output = chunk.toString();
        this.setSpinnerText(output.trim());

        if (output.includes("success") || output.includes("deleted")) {
          success = true;
        }
      });

      await new Promise<void>((resolve, reject) => {
        stream.on("end", () => {
          if (success) {
            this.succeedSpinner(successMessage);
            resolve();
          } else {
            this.failSpinner(`Failed to execute '${command}' on model "${modelName}".`);
            reject('internal error');
          }
        });
        stream.on("error", reject);
      });
    } catch (error) {
      this.failSpinner(`Error executing command "${command}" on model "${modelName}"`, error);
    }
  }
}

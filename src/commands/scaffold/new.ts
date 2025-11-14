import fs from "fs-extra";
import path from "path";
import { downloadTemplate } from "giget";
import { BaseAction } from "../../lib/actions/BaseAction";

export class NewAction extends BaseAction {
  private readonly templateSource = "github:genlayerlabs/genlayer-project-boilerplate";

  async createProject(projectName: string, options: { path: string; overwrite: boolean }) {
    const targetPath = path.resolve(options.path, projectName);

    if (fs.existsSync(targetPath) && !options.overwrite) {
      return this.failSpinner(
        `Project directory "${targetPath}" already exists. Use --overwrite to replace it.`
      );
    }

    this.startSpinner(`Creating new GenLayer project: ${projectName}`);

    try {
      await downloadTemplate(this.templateSource, {
        dir: targetPath,
        force: options.overwrite,
        offline: false,
        install: false,
      });

      this.succeedSpinner(`Project "${projectName}" created successfully at ${targetPath}`);
    } catch (error) {
      this.failSpinner(`Error creating project "${projectName}"`, error);
    }
  }
}

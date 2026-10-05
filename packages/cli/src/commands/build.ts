import { relative } from "node:path";
import { defineCommand } from "citty";
import { parsePlatforms } from "../build/build-platforms.ts";
import { buildArtifact } from "../build/build-artifact.ts";
import { buildImage } from "../build/build-image.ts";
import { fail } from "../ui/fail.ts";
import { intro, outro, plural, print, style, symbols } from "../ui/output.ts";

export default defineCommand({
  meta: {
    name: "build",
    description:
      "Build the app in Linux containers, one per platform: a Docker image, or with --artifact a runnable archive.",
  },
  args: {
    platform: {
      type: "string",
      description: "Comma-separated Docker platforms, e.g. linux/amd64,linux/arm64. Defaults to this machine's.",
    },
    image: {
      type: "string",
      description: "Image name and tag, e.g. registry.example.com/app:1.4.0.",
    },
    push: {
      type: "boolean",
      description: "Push the image to its registry instead of loading it into the local Docker.",
    },
    artifact: {
      type: "boolean",
      description: "Export .output, migrations and a build manifest as an archive in dist/ instead of an image.",
    },
    format: {
      type: "string",
      description: "Archive format for --artifact: tar (default, .tar.gz) or zip.",
    },
  },
  async run({ args }) {
    const cwd = process.cwd();

    if (args.artifact && (args.image !== undefined || args.push)) {
      fail("--image and --push build a Docker image", { hint: "Drop them to build an --artifact archive", exitCode: 2 });
    }

    if (!args.artifact && args.format !== undefined) {
      fail("--format applies to --artifact archives only", { hint: "Add --artifact, or drop --format", exitCode: 2 });
    }

    const platforms = parsePlatforms(args.platform);

    if (args.artifact) {
      const format = args.format ?? "tar";

      if (format !== "tar" && format !== "zip") {
        fail(`Unknown --format=${format}`, { hint: "Use --format tar or --format zip", exitCode: 2 });
      }

      intro("nuxvel build");

      const { code, archives } = await buildArtifact({ cwd, platforms, format });

      process.exitCode = code;
      if (code !== 0) return;

      outro(`${plural(archives.length, "archive")} in dist/`);
      for (const archive of archives) print(`${symbols.success} Built ${style.path(relative(cwd, archive))}`);
      return;
    }

    if (!args.image) {
      fail("Nothing to build", {
        hint: "Pass --image=<name:tag> to build a Docker image, or --artifact for an archive",
        exitCode: 2,
      });
    }

    intro("nuxvel build");

    const push = args.push ?? false;
    const code = await buildImage({ cwd, platforms, image: args.image, push });

    process.exitCode = code;
    if (code === 0) outro(push ? `Pushed ${args.image}` : `Loaded ${args.image} into Docker`);
  },
});

import { Project } from "ts-morph";

const project = new Project();

project.addSourceFilesAtPaths("lib/**/*.ts");

for (const file of project.getSourceFiles()) {
  file.getImportDeclarations().forEach((imp) => {
    if (imp.getModuleSpecifierValue() === "@/lib/queue") {
      imp.remove();
      file.addImportDeclaration({
        moduleSpecifier: "@/lib/queue/outgoing.queue",
        namedImports: ["enqueueOutgoingJob"],
      });
    }
  });

  file.getDescendantsOfKind(235).forEach((node) => {
    const text = node.getText();

    if (text.includes("enqueueJob(")) {
      node.replaceWithText(text.replace("enqueueJob", "enqueueOutgoingJob"));
    }
  });
}

project.saveSync();
console.log("Migration done");

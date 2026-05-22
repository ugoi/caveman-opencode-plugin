// src/config.ts
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { cwd } from "process";
var defaults = {
  enabled: true,
  defaultMode: "full",
  features: {
    caveman: true,
    commit: true,
    review: true
  }
};
function loadConfigFile(path) {
  if (!existsSync(path))
    return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}
function loadConfig() {
  const paths = [
    join(cwd(), "caveman.json"),
    join(homedir(), ".config", "opencode", "caveman.json")
  ];
  for (const path of paths) {
    const cfg = loadConfigFile(path);
    if (cfg) {
      return {
        ...defaults,
        ...cfg,
        features: { ...defaults.features, ...cfg.features }
      };
    }
  }
  return defaults;
}

// src/state.ts
var stateMap = new Map;
function getState(sessionId) {
  if (!stateMap.has(sessionId)) {
    stateMap.set(sessionId, {
      currentMode: "off",
      featuresEnabled: { caveman: true, commit: true, review: true }
    });
  }
  return stateMap.get(sessionId);
}
function setMode(sessionId, mode) {
  const state = getState(sessionId);
  state.currentMode = mode;
}
function getMode(sessionId) {
  return getState(sessionId).currentMode;
}

// src/skills/caveman.ts
function getCavemanSystemInstruction(mode) {
  const base = `You communicate in caveman mode.
Rules:
- Drop articles, filler words, pleasantries, hedging.
- Fragments OK. Use short synonyms.
- Pattern: [thing] [action] [reason]. [next step].
- Auto-clarity exceptions: security warnings, irreversible actions, multi-step sequences.
- Code/commits/PRs write normal.
- User say "stop caveman" or "normal mode" -> revert.`;
  const examples = {
    lite: `Lite intensity. Slightly shorter sentences. Less fluff. Example: "File missing. Add it. Retry."`,
    full: `Full intensity. No articles, no filler, terse. Example: "Bug found. Fix line 12. Commit."`,
    ultra: `Ultra intensity. Minimal tokens. Ellipsis acceptable. Example: "Bug. L12. Fix. Commit. Done."`,
    "wenyan-lite": `Wenyan lite. Classical Chinese lite style. Short, archaic tone. Example: "文缺。补之。再试。"`,
    "wenyan-full": `Wenyan full. Classical Chinese style. Example: "见bug。修之。复行。"`,
    "wenyan-ultra": `Wenyan ultra. Extreme classical compression. Example: "缺。补。行。"`
  };
  const example = examples[mode] || examples.full;
  return `${base}
${example}`;
}
var tailReminders = {
  lite: "REMINDER — caveman LITE active. Tight prose, no filler/hedging/pleasantries. Full sentences kept. Apply from first token.",
  full: "REMINDER — caveman FULL active. Drop articles/filler/hedging/pleasantries. Fragments OK. Pattern: [thing] [action] [reason]. Code symbols exact.",
  ultra: "REMINDER — caveman ULTRA active. Drop articles/filler/hedging/pleasantries/conjunctions. Abbreviate prose. One word when enough. Code symbols exact."
};
var userNudges = {
  lite: "[caveman LITE active — tight prose, no filler, no hedging]",
  full: "[caveman FULL active — drop articles/filler/hedging; fragments OK; pattern: thing action reason]",
  ultra: "[caveman ULTRA active — drop articles/filler/hedging/conjunctions; abbreviate prose; one word when enough]"
};
function getTailReminder(mode) {
  return tailReminders[mode] || tailReminders.full;
}
function getUserNudge(mode) {
  return userNudges[mode] || userNudges.full;
}
function getCompactionContext(mode) {
  return `IMPORTANT: caveman compression mode (${mode}) must be preserved in this summary. The agent must continue responding in caveman style after compaction.`;
}

// src/skills/commit.ts
function getCommitSystemInstruction() {
  return `You generate conventional commit messages caveman style.
Rules:
- Subject line ≤50 chars.
- Imperative mood ("fix" not "fixed").
- Body only for non-obvious why.
- No period at end of subject.
- One-line format unless body needed.`;
}

// src/commands/commit.ts
function handleCommit(sessionId, _args) {
  const cfg = loadConfig();
  if (!cfg.features.commit) {
    return { message: "commit feature disabled." };
  }
  return { systemInstruction: getCommitSystemInstruction() };
}

// src/skills/review.ts
function getReviewSystemInstruction() {
  return `You review code caveman style.
Rules:
- One line per finding.
- Format: L<line>: <severity> <problem>. <fix>.
- Severities: bug, risk, nit, q.
- Drop throat-clearing. Keep exact line numbers and concrete fixes.`;
}

// src/commands/review.ts
function handleReview(sessionId, _args) {
  const cfg = loadConfig();
  if (!cfg.features.review) {
    return { message: "review feature disabled." };
  }
  return { systemInstruction: getReviewSystemInstruction() };
}

// src/index.ts
var validModes = ["lite", "full", "ultra", "wenyan-lite", "wenyan-full", "wenyan-ultra", "off"];
var cavemanPlugin = async () => {
  const hooks = {
    config: async (opencodeConfig) => {
      opencodeConfig.command ??= {};
      opencodeConfig.command["caveman"] = { template: "", description: "Toggle caveman communication mode" };
      opencodeConfig.command["caveman-mode"] = { template: "", description: "Toggle caveman communication mode" };
      opencodeConfig.command["caveman-commit"] = { template: "", description: "Generate commit messages in caveman style" };
      opencodeConfig.command["caveman-review"] = { template: "", description: "Review code in caveman style" };
    },
    "experimental.chat.system.transform": async (input, output) => {
      const cfg = loadConfig();
      if (!cfg.enabled || !cfg.features.caveman)
        return;
      const sessionID = input.sessionID;
      if (!sessionID)
        return;
      let mode = getMode(sessionID);
      if (mode === "off" || !mode) {
        mode = cfg.defaultMode;
        if (mode !== "off") {
          setMode(sessionID, mode);
        } else {
          return;
        }
      }
      output.system.push(getCavemanSystemInstruction(mode));
      output.system.push(getTailReminder(mode));
    },
    "experimental.chat.messages.transform": async (input, output) => {
      const cfg = loadConfig();
      if (!cfg.enabled || !cfg.features.caveman)
        return;
      const sessionID = input.sessionID;
      if (!sessionID)
        return;
      const mode = getMode(sessionID);
      if (mode === "off" || !mode)
        return;
      const last = output.messages?.[output.messages.length - 1];
      if (!last?.parts)
        return;
      last.parts.push({
        id: crypto.randomUUID(),
        sessionID: last.info?.sessionID ?? sessionID,
        messageID: last.info?.id ?? "",
        type: "text",
        text: getUserNudge(mode),
        synthetic: true
      });
    },
    "experimental.session.compacting": async (input, output) => {
      const cfg = loadConfig();
      if (!cfg.enabled || !cfg.features.caveman)
        return;
      const sessionID = input.sessionID;
      if (!sessionID)
        return;
      const mode = getMode(sessionID);
      if (mode === "off" || !mode)
        return;
      output.context = output.context ?? [];
      output.context.push(getCompactionContext(mode));
    },
    "command.execute.before": async (input, output) => {
      const cfg = loadConfig();
      const cmd = output.command ?? input.command;
      const args = (output.args ?? input.arguments).trim();
      const sessionID = input.sessionID;
      if (cmd === "caveman" || cmd === "caveman-mode") {
        if (!cfg.features.caveman) {
          output.parts = [{ type: "text", text: "caveman feature disabled." }];
          return;
        }
        const requested = args.toLowerCase();
        if (!requested) {
          output.parts = [{ type: "text", text: `Mode: ${getMode(sessionID)}. Use /caveman-mode ${validModes.join("|")}` }];
          return;
        }
        if (!validModes.includes(requested)) {
          output.parts = [{ type: "text", text: `Bad mode. Valid: ${validModes.join(", ")}` }];
          return;
        }
        setMode(sessionID, requested);
        if (requested === "off") {
          output.parts = [{ type: "text", text: "Caveman mode off." }];
          return;
        }
        output.parts = [{ type: "text", text: `Caveman mode ${requested}.` }];
        return;
      }
      if (cmd === "caveman-commit") {
        if (!cfg.features.commit) {
          output.parts = [{ type: "text", text: "commit feature disabled." }];
          return;
        }
        const result = handleCommit(sessionID, args.split(/\s+/));
        output.parts = [{ type: "text", text: result.systemInstruction || "" }];
        return;
      }
      if (cmd === "caveman-review") {
        if (!cfg.features.review) {
          output.parts = [{ type: "text", text: "review feature disabled." }];
          return;
        }
        const result = handleReview(sessionID, args.split(/\s+/));
        output.parts = [{ type: "text", text: result.systemInstruction || "" }];
        return;
      }
    }
  };
  return hooks;
};
var src_default = cavemanPlugin;
export {
  src_default as default
};

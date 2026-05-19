const chalk = require('chalk');

let _spinner = null;
let _tickLen = 0; // last tick text length, for CLI line-clearing

const progress = {
  setSpinner(spinner) {
    _spinner = spinner;
    _tickLen = 0;
  },

  clearSpinner() {
    _spinner = null;
    _tickLen = 0;
  },

  // Overwrite the current terminal line with a progress update
  tick(text) {
    if (_spinner) {
      _spinner.text = text;
    } else {
      const line = chalk.dim(text);
      const pad = ' '.repeat(Math.max(0, _tickLen - line.length));
      process.stdout.write(`\r${line}${pad}`);
      _tickLen = line.length;
    }
  },

  // Print an informational line without disrupting spinner/tick state
  info(text) {
    if (_spinner) {
      const saved = _spinner.text;
      _spinner.stop();
      console.log(chalk.dim('  ·') + ' ' + text);
      _spinner.start(saved);
    } else {
      process.stdout.write(`\r${' '.repeat(_tickLen + 3)}\r`);
      _tickLen = 0;
      console.log(chalk.dim('  ·') + ' ' + text);
    }
  },

  // Move past the last tick line (CLI mode only — spinner handles its own newlines)
  newline() {
    if (!_spinner) {
      process.stdout.write('\n');
      _tickLen = 0;
    }
  },
};

module.exports = progress;

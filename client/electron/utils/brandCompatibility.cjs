const path = require('node:path');

// The current profile is selected by Electron or explicitly by the caller.
function restoreExistingProfile() {}

function workspaceDatabasePath(workspace) {
  return path.join(workspace, 'savia.sqlite');
}

module.exports = { restoreExistingProfile, workspaceDatabasePath };

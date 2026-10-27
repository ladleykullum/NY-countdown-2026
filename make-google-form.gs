/**
 * Builds the NYE Song Countdown Google Form and its responses sheet.
 *
 * 1. Go to https://script.google.com and click "New project".
 * 2. Delete what's there, paste this whole file in, and click Save.
 * 3. Click Run (with createNyeForm selected). Approve the permissions when Google asks.
 * 4. Open View → Execution log (or Ctrl/Cmd+Enter) to get the links.
 */
function createNyeForm() {
  const form = FormApp.create('NYE Song Countdown 2026');
  form
    .setDescription(
      'Pick ONE song for our New Year\'s Eve song countdown. ' +
      'Songs go head to head in a bracket and the room votes. ' +
      'Your name stays secret until your song gets knocked out.'
    )
    .setAllowResponseEdits(true)
    .setConfirmationMessage('You\'re in! See you on New Year\'s Eve.');

  form.addTextItem()
    .setTitle('Your name')
    .setHelpText('The name everyone knows you by. This shows up if your song is knocked out.')
    .setRequired(true);

  form.addTextItem()
    .setTitle('Song (artist - title)')
    .setHelpText('e.g. Daft Punk - One More Time');

  form.addTextItem()
    .setTitle('YouTube link')
    .setHelpText('Find the song on YouTube, click Share, and paste the link here.')
    .setRequired(true)
    .setValidation(
      FormApp.createTextValidation()
        .setHelpText('Please paste a YouTube link (youtube.com or youtu.be).')
        .requireTextMatchesPattern('.*(youtube\\.com|youtu\\.be).*')
        .build()
    );

  form.addTextItem()
    .setTitle('Start time')
    .setHelpText('Where the song should start playing, in minutes:seconds. e.g. 1:05 for the chorus. Use 0:00 for the beginning.')
    .setRequired(true)
    .setValidation(
      FormApp.createTextValidation()
        .setHelpText('Use minutes:seconds, like 1:05')
        .requireTextMatchesPattern('^\\s*\\d{1,2}:\\d{2}\\s*$')
        .build()
    );

  const sheet = SpreadsheetApp.create('NYE Song Countdown 2026 (responses)');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());

  Logger.log('Send this link to your friends:  ' + form.getPublishedUrl());
  Logger.log('Edit the form here:              ' + form.getEditUrl());
  Logger.log('Responses sheet:                 ' + sheet.getUrl());
}

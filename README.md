# NYE Song Countdown

A New Year's Eve song knockout. Everyone submits a song through a Google Form, the site shuffles them into a random bracket, you play each matchup from YouTube, the room votes, and the losing friend's face pops up when their song goes out.

## Put it online (one time)

1. On GitHub, open this repo → **Settings** → **Pages**.
2. Under **Build and deployment**, set **Source** to *Deploy from a branch*, choose **main** and **/ (root)**, then **Save**.
3. After a minute the site is live at `https://ladleykullum.github.io/ny-countdown-2026/`.

## The Google Form

Make a form with these questions (short-answer is fine for all of them):

| Question | Example answer |
| --- | --- |
| Your name | Sam |
| Song (artist – title) | Daft Punk – One More Time |
| YouTube link | https://youtu.be/FGBhQbmPwH8 |
| Start time | 1:05 |

The song name is optional. If it's blank, the title is pulled from YouTube. Start time can be written as `1:05`, `65`, `1m5s` or `1.05`.

## Getting the answers into the site

In the form, go to **Responses → Link to Sheets**. In that sheet, either:

- **File → Share → Publish to web**, choose the responses sheet and **Comma-separated values (.csv)**, then paste that link into the site and press **Load answers**. Press it again later to pick up late entries.
- or **File → Download → Comma-separated values (.csv)** and use **Upload CSV file**.

## Photos

Click **Upload photos** and pick everyone's photos at once. Name each file after the person (`sam.jpg`, `priya.png`) and they'll match up automatically. You can also click any face to add or change a photo.

## On the night

- Do the setup on the laptop you'll play from. Songs, photos and bracket progress are saved in that browser.
- Names stay hidden during each matchup so votes are fair. You only see who picked a song once it's knocked out.
- If you have an odd number of songs, the site will remind you to add one more. Bracket sizes of 4, 8, 16 or 32 give everyone a first-round match. Any other number gives a few random songs a free pass into round 2.
- Every knocked-out person gets a random insult stamped on their photo (no repeats until they've all been used), plus a sad trombone. Edit the list in `insults.js`.
- Made a mistake? **Undo last pick** steps back one result.
- Some music videos don't allow playing on other sites. If one won't play, an **Open it on YouTube** link appears that starts at the right time.

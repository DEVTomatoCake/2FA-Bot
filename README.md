# 2FA-Bot
This discord bot can be used to verify server members using two/multifactor authentification, and giving roles after verifying successfully.
Can be used to temporary or permanently grant access to additional permissions.

## How to use
1. Download files and install packages using a package manager, e.g. by running `npm i`
2. Replace `<Token>` in the index.js file with your bots token
3. Start the bot using `node index.js`. The slash commands are created automatically.
- Done!

The bot will automatically check every 3min (cronjob, can be changed) if any of the verification roles need to be removed from a user.

## Support server
[![](https://discord.com/api/guilds/694194461122756649/widget.png?style=banner3)](https://discord.gg/ZqzFUC8qe9)

## Settings

`/auth code:<Code>`
Main command used to verify

`/setup`
Setup 2fa with the bot

`/config roleadd|roleremove|list`
Add, manage or remove verification roles

`/help`
General help command

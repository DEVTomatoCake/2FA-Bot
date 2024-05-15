const Discord = require("discord.js")
const bot = new Discord.Client({
	allowedMentions: {
		repliedUser: false,
		parse: ["users"]
	},
	failIfNotExists: false,
	intents: [
		Discord.GatewayIntentBits.Guilds
	]
})
bot.login("<Token>")

const ems = require("enhanced-ms")({shortFormat: true})
const moment = require("moment")
require("moment-duration-format")
const speakeasy = require("@levminer/speakeasy")
const QRCode = require("qrcode")
const schedule = require("node-schedule")

const Enmap = require("enmap")
bot.mfa = new Enmap({
	name: "mfa"
})
bot.mfasettings = new Enmap({
	name: "mfasettings"
})

/*
{
	id: "", // Role ID
	time: 0, // Time in ms after which to remove the role - 0 = permanently
	channels: [], // List of channels in which users can verify and get the role
	roles: [] // List of roles needed to verify
}
*/
const defaultSettings = {
	roles: {}
}

const botlinkrow = new Discord.ActionRowBuilder()
	.addComponents(
		new Discord.MessageButton()
			.setLabel("Support server")
			.setEmoji("712731848673067108")
			.setURL("https://discord.gg/ZqzFUC8qe9")
			.setStyle("LINK")
	)
const confirmrow = new Discord.ActionRowBuilder()
	.addComponents(
		new Discord.MessageButton()
			.setCustomId("2fa_setup_yes")
			.setLabel("Continue")
			.setStyle("DANGER")
	)
	.addComponents(
		new Discord.MessageButton()
			.setCustomId("2fa_setup_no")
			.setLabel("Cancel")
			.setStyle("SUCCESS")
)
const setupverifyrow = new Discord.ActionRowBuilder()
	.addComponents(
		new Discord.MessageButton()
			.setCustomId("2fa_setup_verify")
			.setLabel("Verify")
			.setStyle("PRIMARY")
	)
const verifymodal = new Discord.ModalBuilder()
	.setCustomId("setup_confirm")
	.setTitle("Confirm 2FA")
	.addComponents(
		new Discord.ActionRowBuilder()
			.addComponents(
				new Discord.TextInputBuilder()
					.setCustomId("setup_code")
					.setLabel("Enter your 2FA code")
					.setStyle(Discord.TextInputStyle.Short)
					.setPlaceholder("2FA code, e.g. 123456")
					.setMinLength(6)
					.setMaxLength(6)
			)
	)

const updateSlashcommands = () => {
	bot.application.commands.set([
		{
			name: "help",
			description: "Displays help and stats about the bot",
			descriptionLocalizations: {
				de: "Zeigt die Hilfe und Statistiken vom Bot an"
			}
		},{
			name: "setup",
			description: "Sets up 2FA",
			descriptionLocalizations: {
				de: "Richtet 2FA ein"
			}
		},{
			name: "config",
			description: "Modifies the config for the server",
			descriptionLocalizations: {
				de: "Ändert die Einstellungen für den Server"
			},
			defaultMemberPermissions: ["Administrator"],
			integrationTypes: [0],
			contexts: [0],
			options: [{
				name: "list",
				type: Discord.ApplicationCommandOptionType.Subcommand,
				description: "Displays the settings",
				descriptionLocalizations: {
					de: "Zeigt die Einstellungen an"
				}
			},{
				name: "roleadd",
				type: Discord.ApplicationCommandOptionType.Subcommand,
				description: "Adds a new role",
				descriptionLocalizations: {
					de: "Fügt eine neue Rolle hinzu"
				},
				options: [{
					name: "role",
					type: Discord.ApplicationCommandOptionType.Role,
					description: "The role",
					descriptionLocalizations: {
						de: "Die Rolle"
					},
					required: true
				},{
					name: "time",
					type: Discord.ApplicationCommandOptionType.String,
					description: "Die Zeit, nachdem die Rolle entfernt werden soll und der Nutzer sich neu authentifizieren muss",
					maxLength: 50
				}]
			},{
				name: "roleremove",
				type: Discord.ApplicationCommandOptionType.Subcommand,
				description: "Removes a verified role",
				descriptionLocalizations: {
					de: "Löscht eine Verifizierten-Rolle"
				},
				options: [{
					name: "role",
					type: Discord.ApplicationCommandOptionType.Role,
					description: "The role",
					descriptionLocalizations: {
						de: "Die Rolle"
					},
					required: true
				}]
			}]
		},{
			name: "auth",
			description: "Authenticates you",
			descriptionLocalizations: {
				de: "Authenfiziert dich"
			},
			integrationTypes: [0],
			contexts: [0],
			options: [{
				name: "code",
				type: Discord.ApplicationCommandOptionType.String,
				description: "Der Code der Auth-App oder einer deiner Backupcodes",
				required: true,
				minLength: 6,
				maxLength: 11
			}]
		}
	])
}

schedule.scheduleJob("*/3 * * * *", () => { // Check every 3 minutes if a verification role's time is over
	bot.mfa.forEach(user => {
		if (!user.timers || user.timers.length == 0) return

		const newtimers = []
		user.timers.forEach(async timer => {
			if (Date.now() >= timer.time) {
				const member = await bot.guilds.cache.get(timer.guild).members.fetch(user.id)
				member.roles.remove(timer.role)
			} else newtimers.push(timer)
		})
		bot.mfa.set(user.id, newtimers, "timers")
	})
})

bot.on("ready", () => {
	updateSlashcommands()
	bot.user.setPresence({activities: [{name: "/setup", type: Discord.ActivityType.Listening}]})
})

bot.on("guildCreate", guild => {
	bot.mfasettings.ensure(guild.id, defaultSettings)
})
bot.on("guildDelete", guild => {
	bot.mfasettings.delete(guild.id)
})

bot.on("interactionCreate", async interaction => {
	if (interaction.type == Discord.InteractionType.ModalSubmit && interaction.customId == "2fa_setup_verify") {
		const secret = bot.mfa.get(interaction.user.id, "tempsecret")

		const verified = speakeasy.totp.verify({secret, token: Number.parseInt(interaction.fields.getTextInputValue("setup_code")), encoding: "base32", window: 1})
		if (!verified) return interaction.reply({content: ":x: The code is invalid!", ephemeral: true})

		const codes = [Math.random(), Math.random(), Math.random(), Math.random(), Math.random()].map(code => code.toString(36).slice(2))
		bot.mfa.set(interaction.user.id, {
			id: interaction.user.id,
			secret,
			backupCodes: codes,
			timers: []
		})

		interaction.update({
			content: "2FA wurde erfolgreich aktiviert!\n\nDies sind deine Backupcodes - sie sind die einzige Möglichkeit, " +
				"2FA zu deaktivieren, solltest du dein Gerät verlieren! **Speichere sie an einem sicheren Ort.**",
			files: [{
				name: "2fabot_backupcodes.txt",
				attachment: Buffer.from("2FA Bot Backupcodes\n" + codes.join("\n"), "utf8")
			}],
			embeds: [],
			components: []
		})
	}
	if (interaction.type != Discord.InteractionType.ApplicationCommand) return

	const settings = bot.mfasettings.ensure(interaction.guild.id, defaultSettings)

	if (interaction.commandName == "help") {
		const embed = new Discord.MessageEmbed()
			.setAuthor({name: "Bot-Info", iconURL: bot.user.displayAvatarURL()})
			.addField("Server", "" + bot.guilds.cache.size, true)
			.addField("Registered users", "" + bot.mfa.size, true)
			.addField("Uptime", moment.duration(bot.uptime).format("D [Tage], H [Stunden], m [Minuten], s [Sekunden]"), true)

		await interaction.reply({embeds: [embed], components: [botlinkrow]})
	} else if (interaction.commandName == "config") {
		if (interaction.options.getSubcommand(false) == "list") {
			let text = ""
			Object.keys(settings).forEach(key => {
				text += key + ": " + JSON.stringify(settings[key]) + "\n"
			})

			const embed = new Discord.MessageEmbed()
				.setDescription(text)
			interaction.reply({embeds: [embed]})
		} else if (interaction.options.getSubcommand(false) == "roleadd") {
			const role = interaction.options.getRole("role")
			const time = interaction.options.getString("time")

			bot.mfasettings.push(interaction.guild.id, {
				id: role.id,
				time: time ? (ems(time) || 0) : 0,
				channels: [], // Liste der Kanäle, in denen man sich verifizieren kann
				roles: [] // Liste der Rollen, die man zum Verifizieren braucht
			}, "roles")
			if (bot.mfasettings.roles.some(r => r.id == role.id)) interaction.reply("The verification role <@&" + role.id + "> was edited!")
			else interaction.reply("The role <@&" + role.id + "> was added as verification role!")
		} else if (interaction.options.getSubcommand(false) == "roleremove") {
			const findrole = interaction.options.getRole("role")

			const newroles = []
			Object.values(settings.roles).forEach(role => {
				if (role.id != findrole.id) newroles.push(role)
			})

			if (newroles.length == Object.values(settings.roles).length) interaction.reply("The role <@&" + findrole.id + "> is not a verification role!")
			else {
				bot.mfasettings.set(interaction.guild.id, newroles, "roles")
				interaction.reply("The verification role <@&" + findrole.id + "> was removed!")
			}
		}
	} else if (interaction.commandName == "setup") {
		if (bot.mfa.has(interaction.user.id)) {
			const msg = await interaction.reply({
				content: ":warning: Du hast bereits eine aktive Verifizierung! Wenn du fortfährst wird die alte Verifizierung ungültig.",
				components: [confirmrow],
				ephemeral: true,
				fetchReply: true
			})

			const confirmbutton = await msg.awaitMessageComponent({time: 45000, componentType: Discord.ComponentType.Button})
			if (confirmbutton.customId == "2fa_setup_no") return interaction.editReply({content: ":x: Cancelled.", components: []})
			else await confirmbutton.deferUpdate()
		}

		const secret = speakeasy.generateSecret({name: interaction.user.tag, issuer: "2FA Bot"})

		bot.mfa.set(interaction.user.id, secret.base32, "tempsecret")

		QRCode.toDataURL(secret.otpauth_url.replace("2FA Bot", "2FA%20Bot") + "&algorithm=SHA1&digits=6&period=30", async (err, url) => {
			const embed = new Discord.MessageEmbed()
				.setAuthor({name: "2FA Setup", iconURL: bot.user.displayAvatarURL()})
				.setDescription("Bitte scanne diesen QR-Code mit einer Authenticator-App ein.\n\nAlternativ kannst du auch \"Zeitbasiert\" " +
					"auswählen und folgendes Secret angeben:\n||**`" + secret.base32 + "`**||")
				.setImage("attachment://qrcode.png")

			if (interaction.replied) await interaction.editReply({
				content: null,
				embeds: [embed],
				files: [{
					name: "qrcode.png",
					attachment: new Buffer.from(url.split(",")[1], "base64"),
					description: "2FA-QR-Code"
				}],
				components: [setupverifyrow],
				ephemeral: true
			})
			else await interaction.reply({
				embeds: [embed],
				files: [{
					name: "qrcode.png",
					attachment: new Buffer.from(url.split(",")[1], "base64"),
					description: "2FA-QR-Code"}],
					components: [setupverifyrow],
					ephemeral: true
				})
			const msg = await interaction.fetchReply()

			const collector = msg.createMessageComponentCollector({time: 120000, componentType: Discord.ComponentType.Button})
			collector.on("collect", async i => {
				i.showModal(verifymodal)
			})
		})
	} else if (interaction.commandName == "auth") {
		const user = bot.mfa.get(interaction.user.id)
		if (!user) return interaction.reply({content: "You dont have an account! Create one using `/setup`.", ephemeral: true})

		if (interaction.options.getString("code").toString().length != 6) return interaction.reply({content: "The code must be 6 characters long!", ephemeral: true})

		const verified = speakeasy.totp.verify({secret: user.secret, token: interaction.options.getString("code"), encoding: "base32", window: 1})
		if (!verified) return interaction.reply({content: ":x: Invalid code!", ephemeral: true})

		interaction.reply({content: ":white_check_mark: You were verified successfully!", ephemeral: true})
		Object.values(settings.roles).forEach(role => {
			interaction.member.roles.add(role.id)
			if (role.time > 0)
				bot.mfa.push(interaction.user.id, {
					role: role.id,
					guild: interaction.guild.id,
					time: Date.now() + role.time
				}, "timers")
		})
	}
})

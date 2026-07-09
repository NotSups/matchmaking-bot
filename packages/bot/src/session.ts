import {
  ChannelType,
  PermissionFlagsBits,
  type GuildTextBasedChannel,
  type TextChannel,
  type VoiceChannel,
} from "discord.js";
import type { Client, Message, GuildMember } from "discord.js";
import type { Match } from "@matchmaking/core";
import type { Storage } from "@matchmaking/core";
import { logger } from "./logger.js";

interface Session {
  match: Match;
  channelA?: string; // guild A text channel id
  channelB?: string; // guild B text channel id
  voiceA?: string;
  voiceB?: string;
  endedAt?: number;
}

const short = (id: string) => id.replace(/-/g, "").slice(0, 8);

export class SessionManager {
  private sessions = new Map<string, Session>();
  private channelToSession = new Map<string, string>();
  private userToMatch = new Map<string, string>();

  constructor(
    private client: Client,
    private storage: Storage,
  ) {}

  getUserMatch(userId: string): string | undefined {
    return this.userToMatch.get(userId);
  }

  getByChannel(channelId: string): Session | undefined {
    const id = this.channelToSession.get(channelId);
    return id ? this.sessions.get(id) : undefined;
  }

  /** Create the private channel(s) for a match and wire up bridging. */
  async createForMatch(match: Match): Promise<Session> {
    const sess: Session = { match };
    const tag = `match-${short(match.id)}`;

    const sameGuild = match.guildA === match.guildB;
    const wantsText = match.mode === "TEXT" || match.mode === "BOTH";
    const wantsVoice = match.mode === "VOICE" || match.mode === "BOTH";

    if (sameGuild && match.guildA) {
      const guild = this.client.guilds.cache.get(match.guildA);
      if (guild && wantsText) {
        const ch = await this.makeTextChannel(guild, tag, [match.userA, match.userB]);
        sess.channelA = ch.id;
        this.channelToSession.set(ch.id, match.id);
      }
    } else {
      if (wantsText) {
        const ga = this.client.guilds.cache.get(match.guildA);
        const gb = this.client.guilds.cache.get(match.guildB);
        if (ga) sess.channelA = (await this.makeTextChannel(ga, `${tag}-a`, [match.userA])).id;
        if (gb) sess.channelB = (await this.makeTextChannel(gb, `${tag}-b`, [match.userB])).id;
        if (sess.channelA) this.channelToSession.set(sess.channelA, match.id);
        if (sess.channelB) this.channelToSession.set(sess.channelB, match.id);
      }
    }

    if (wantsVoice) {
      const ga = this.client.guilds.cache.get(match.guildA);
      const gb = this.client.guilds.cache.get(match.guildB);
      if (ga) sess.voiceA = (await this.makeVoiceChannel(ga, `${tag}-a`, [match.userA]))?.id;
      if (gb) sess.voiceB = (await this.makeVoiceChannel(gb, `${tag}-b`, [match.userB]))?.id;
    }

    this.sessions.set(match.id, sess);
    this.userToMatch.set(match.userA, match.id);
    this.userToMatch.set(match.userB, match.id);
    return sess;
  }

  private async makeTextChannel(
    guild: Guild,
    name: string,
    allowedUserIds: string[],
  ): Promise<TextChannel> {
    const channel = await guild.channels.create({
      name,
      type: ChannelType.GuildText,
      topic: "Salon de match privé — reste courtois. /leave pour quitter.",
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        ...allowedUserIds.map((uid) => ({
          id: uid,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        })),
      ],
    });
    return channel as TextChannel;
  }

  private async makeVoiceChannel(
    guild: Guild,
    name: string,
    allowedUserIds: string[],
  ): Promise<VoiceChannel | null> {
    try {
      const channel = await guild.channels.create({
        name,
        type: ChannelType.GuildVoice,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
          ...allowedUserIds.map((uid) => ({
            id: uid,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
          })),
        ],
      });
      return channel as VoiceChannel;
    } catch (err) {
      logger.warn("voice channel creation failed", { guild: guild.id, err: String(err) });
      return null;
    }
  }

  /** Bridge a user's message to their partner's channel. */
  async relay(message: Message): Promise<void> {
    const sess = this.getByChannel(message.channelId);
    if (!sess || message.author.bot) return;
    if (!sess.channelA || !sess.channelB) return; // single-guild match: no bridging needed

    const fromA = message.channelId === sess.channelA;
    const targetId = fromA ? sess.channelB : sess.channelA;
    const target = this.client.channels.cache.get(targetId) as GuildTextBasedChannel | undefined;
    if (!target) return;

    const who = fromA ? sess.match.usernameA : sess.match.usernameB;
    const content = `**${who}:** ${message.content}`;
    await target.send({ content, files: message.attachments.map((a) => a.url) }).catch(() => {});
  }

  /** Tear down a match and clean up channels. */
  async end(matchId: string, opts?: { rating?: number; liked?: boolean; silent?: boolean }): Promise<void> {
    const sess = this.sessions.get(matchId);
    if (!sess) return;
    const endedAt = Date.now();
    const durationSeconds = Math.round((endedAt - sess.match.startedAt) / 1000);

    await this.storage.endMatch(matchId, {
      endedAt,
      durationSeconds,
      rating: opts?.rating,
      liked: opts?.liked,
    });
    await this.storage.logActivity("match_end", { matchId, durationSeconds });

    for (const chId of [sess.channelA, sess.channelB, sess.voiceA, sess.voiceB]) {
      if (!chId) continue;
      const ch = this.client.channels.cache.get(chId);
      if (ch) await ch.delete().catch(() => {});
      this.channelToSession.delete(chId);
    }
    this.userToMatch.delete(sess.match.userA);
    this.userToMatch.delete(sess.match.userB);
    this.sessions.delete(matchId);
  }

  activeCount(): number {
    return this.sessions.size;
  }

  session(matchId: string): Session | undefined {
    return this.sessions.get(matchId);
  }

  /** Helper to resolve a guild member's display name. */
  static displayName(member: GuildMember | null, fallback: string): string {
    return member?.displayName ?? fallback;
  }
}

// Minimal Guild type alias to avoid importing the heavy class just for typing.
type Guild = import("discord.js").Guild;

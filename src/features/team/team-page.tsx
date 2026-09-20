import Image from "next/image";
import { ArrowRightIcon, ArrowUpRightIcon, MailIcon } from "lucide-react";
import { FeedbackLink as Link } from "@/components/shell/feedback-link";

import { Button } from "@/components/ui/button";
import { localePath, type PortalLocale } from "@/i18n/routing";

import { teamMembers } from "./team-data";
import "../../components/shell/site-shell.css";
import "./team-page.css";

type TeamLabels = (typeof import("@/i18n/messages/en.json"))["Team"];
type TeamMember = (typeof teamMembers)[number];

function MemberIdentity({ member, labels }: { member: TeamMember; labels: TeamLabels }) {
  return (
    <div className="team-member-identity">
      <p className="team-member-role">{labels.roles[member.role]}</p>
      <div className="team-member-name-row">
        <h3>{member.name}</h3>
        {member.email ? (
          <a
            className="team-member-email"
            href={`mailto:${member.email}`}
            aria-label={labels.emailMember.replace("{name}", member.name)}
          >
            <MailIcon aria-hidden="true" />
          </a>
        ) : null}
      </div>
      <p className="team-member-institution">{labels.institutions[member.institution]}</p>
    </div>
  );
}

function TeamPortrait({ member, priority = false }: { member: TeamMember; priority?: boolean }) {
  return (
    <div className="team-member-portrait">
      <Image
        alt=""
        aria-hidden="true"
        fill
        priority={priority}
        sizes="(max-width: 680px) 100vw, (max-width: 1080px) 50vw, 25vw"
        src={`/team/portraits/${member.slug}.webp`}
      />
      <span className="team-member-image-wash" aria-hidden="true" />
    </div>
  );
}

/** @import import { TeamPageView } from "@/features/team/team-page"; */
export function TeamPageView({ labels, locale }: { labels: TeamLabels; locale: PortalLocale }) {
  const [founder, ...members] = teamMembers;

  return (
    <main id="main-content" className="team-page">
      <section className="team-hero site-shell-container">
        <div className="team-hero-grid" aria-hidden="true" />
        <div className="team-hero-heading">
          <h1>{labels.kicker}</h1>
          <p>{labels.description}</p>
        </div>
      </section>

      <section className="team-roster site-shell-container" aria-labelledby="team-roster-title">
        <h2 className="sr-only" id="team-roster-title">
          {labels.title}
        </h2>
        <article className="team-founder-card" id={founder.slug}>
          <TeamPortrait member={founder} priority />
          <div className="team-founder-copy">
            <MemberIdentity member={founder} labels={labels} />
            <p>{labels.founderNote}</p>
          </div>
        </article>

        <div className="team-member-grid">
          {members.map((member) => (
            <article className="team-member-card" id={member.slug} key={member.slug}>
              <TeamPortrait member={member} />
              <MemberIdentity member={member} labels={labels} />
            </article>
          ))}
        </div>
      </section>

      <section
        className="team-community-cta site-shell-container"
        aria-labelledby="team-community-title"
      >
        <div>
          <p className="team-kicker">{labels.communityActionKicker}</p>
          <h2 id="team-community-title">{labels.communityActionTitle}</h2>
        </div>
        <div className="team-community-cta-copy">
          <p>{labels.communityActionDescription}</p>
          <Button asChild size="lg" variant="outline">
            <Link href={localePath(locale, "community")}>
              {labels.communityAction}
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      </section>

      <section className="team-contact site-shell-container" aria-labelledby="team-contact-title">
        <div>
          <p className="team-kicker">{labels.contactKicker}</p>
          <h2 id="team-contact-title">{labels.contactTitle}</h2>
        </div>
        <div className="team-contact-copy">
          <p>{labels.contactDescription}</p>
          <div className="team-contact-actions">
            <Button asChild size="lg">
              <a href="mailto:contact@tiangong.earth">
                {labels.contactAction}
                <MailIcon data-icon="inline-end" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="https://www.linkedin.com/company/tiangonglca">
                LinkedIn
                <ArrowUpRightIcon data-icon="inline-end" />
              </a>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}

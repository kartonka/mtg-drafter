import type { Card } from '../../shared/protocol';

interface MechanicHelp {
    name: string;
    description: string;
    terms: string[];
    inTypeLine?: boolean;
}

// Short, player-facing summaries. The full rules text on the card remains authoritative.
const MECHANICS: MechanicHelp[] = [
    { name: 'The Ring tempts you', terms: ['the ring tempts you'], description: 'The Ring emblem gains its next ability in order. If you control a creature, choose one to be your Ring-bearer; you get the emblem if you don’t already have it.' },
    { name: 'Scry', terms: ['scry'], description: 'Look at the top cards of your library, then put any number on the bottom and the rest back on top in any order.' },
    { name: 'Saga', terms: ['saga'], inTypeLine: true, description: 'A Saga gets a lore counter as it enters and after your draw step. Its chapter abilities trigger when it has the matching number of lore counters.' },
    { name: 'Transform', terms: ['transform', 'transforms', 'transformed', 'transformation'], description: 'Turn a double-faced permanent over to its other face. It remains the same permanent.' },
    { name: 'Flying', terms: ['flying'], description: 'Can be blocked only by creatures with flying or reach.' },
    { name: 'Reach', terms: ['reach'], description: 'Can block creatures with flying.' },
    { name: 'Trample', terms: ['trample'], description: 'When it attacks and is blocked, excess damage can be assigned to the defending player or planeswalker.' },
    { name: 'Deathtouch', terms: ['deathtouch'], description: 'Any amount of damage it deals to a creature is enough to destroy that creature.' },
    { name: 'Lifelink', terms: ['lifelink'], description: 'Damage it deals also causes you to gain that much life.' },
    { name: 'Vigilance', terms: ['vigilance'], description: 'Attacking with it does not cause it to tap.' },
    { name: 'Haste', terms: ['haste'], description: 'It can attack and use tap abilities even if it has not been under your control since your turn began.' },
    { name: 'First strike', terms: ['first strike'], description: 'It deals combat damage in an earlier combat damage step than creatures without first strike or double strike.' },
    { name: 'Double strike', terms: ['double strike'], description: 'It deals combat damage in both the first-strike and regular combat damage steps.' },
    { name: 'Menace', terms: ['menace'], description: 'It can’t be blocked except by two or more creatures.' },
    { name: 'Ward', terms: ['ward'], description: 'When an opponent targets it with a spell or ability, that player must pay its ward cost or that spell or ability is countered.' },
    { name: 'Hexproof', terms: ['hexproof'], description: 'It can’t be targeted by spells or abilities your opponents control.' },
    { name: 'Indestructible', terms: ['indestructible'], description: 'Damage and effects that say “destroy” don’t destroy it.' },
    { name: 'Flash', terms: ['flash'], description: 'You may cast it any time you could cast an instant.' },
    { name: 'Defender', terms: ['defender'], description: 'It can’t attack.' },
    { name: 'Prowess', terms: ['prowess'], description: 'Whenever you cast a noncreature spell, it gets +1/+1 until end of turn.' },
    { name: 'Cycling', terms: ['cycling'], description: 'Pay the cycling cost and discard this card to draw a card.' },
    { name: 'Kicker', terms: ['kicker'], description: 'You may pay the kicker cost in addition to the spell’s other costs for an extra effect.' },
    { name: 'Flashback', terms: ['flashback'], description: 'You may cast this card from your graveyard by paying its flashback cost; exile it if it would leave the stack.' },
    { name: 'Equip', terms: ['equip'], description: 'Pay the equip cost to attach this Equipment to a creature you control. Activate only as a sorcery.' },
    { name: 'Investigate', terms: ['investigate'], description: 'Create a Clue artifact token. You can sacrifice it and pay {2} to draw a card.' },
    { name: 'Surveil', terms: ['surveil'], description: 'Look at the top cards of your library, then put any number into your graveyard and the rest back on top in any order.' },
    { name: 'Connive', terms: ['connive', 'connives'], description: 'Draw a card, discard a card, then put a +1/+1 counter on the creature if you discarded a nonland card.' },
    { name: 'Explore', terms: ['explore', 'explores'], description: 'Reveal the top card of your library. If it’s a land, put it into your hand; otherwise put a +1/+1 counter on the exploring creature, then keep or discard the revealed card.' },
    { name: 'Adapt', terms: ['adapt'], description: 'If the creature has no +1/+1 counters on it, pay the adapt cost to put the stated number of +1/+1 counters on it.' },
    { name: 'Amass', terms: ['amass'], description: 'Put the stated number of +1/+1 counters on an Army you control, or create a 0/0 Army first if you don’t control one.' },
    { name: 'Incubate', terms: ['incubate'], description: 'Create an Incubator artifact token with the stated number of +1/+1 counters. Pay {2} to transform it into a 0/0 Phyrexian creature.' },
    { name: 'The Ring', terms: ['ring-bearer'], description: 'The Ring emblem’s abilities build up as it tempts you: your Ring-bearer is legendary and harder to block, then gains attack and combat benefits.' },
    { name: 'Waterbend', terms: ['waterbend'], description: 'Pay the waterbend cost by tapping artifacts and/or creatures you control. Each one pays for {1}.' },
    { name: 'Exhaust', terms: ['exhaust'], description: 'An ability that can be activated only once. Exhaust abilities usually have an additional cost or effect.' },
    { name: 'Discover', terms: ['discover'], description: 'Exile cards from the top of your library until you exile a nonland card with mana value no greater than the discover number. You may cast it without paying its mana cost or put it into your hand, then put the rest on the bottom.' },
    { name: 'Cascade', terms: ['cascade'], description: 'Exile cards from the top of your library until you exile a nonland card with lower mana value. You may cast it without paying its mana cost, then put the rest on the bottom.' },
    { name: 'Convoke', terms: ['convoke'], description: 'Your creatures can help pay for the spell: each tapped creature pays for {1} or one mana of its color.' },
    { name: 'Delve', terms: ['delve'], description: 'Each card you exile from your graveyard pays for {1} of the spell’s generic mana cost.' },
    { name: 'Crew', terms: ['crew'], description: 'Tap other creatures with total power at least the crew number to make the Vehicle an artifact creature until end of turn.' },
    { name: 'Escape', terms: ['escape'], description: 'You may cast this card from your graveyard by paying its escape cost and exiling the required other cards from your graveyard.' },
    { name: 'Foretell', terms: ['foretell'], description: 'Pay {2} and exile this card face down from your hand during your turn. On a later turn, cast it for its foretell cost.' },
    { name: 'Adventure', terms: ['adventure'], description: 'You may cast the Adventure half as an instant or sorcery. If it resolves, exile the card and you may later cast its creature half from exile.' },
];

function hasTerm(text: string, term: string) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\p{L}])${escaped}([^\\p{L}]|$)`, 'iu').test(text);
}

export function mechanicHelp(card: Card): { name: string; description: string }[] {
    const text = [card.oracleText, card.backOracleText, ...(card.keywords ?? [])].filter(Boolean).join('\n');
    return MECHANICS.filter((mechanic) =>
        mechanic.terms.some((term) => hasTerm(text, term) || ((mechanic.inTypeLine || term === 'saga') && hasTerm(card.typeLine ?? '', term)))
    ).map(({ name, description }) => ({ name, description }));
}

/**
 * momentsLinking.ts
 *
 * The Moments half of the root deep-link config, kept in its own module so it
 * can be unit-tested without pulling in the navigator tree (which mounts auth,
 * native stacks, and every screen).
 *
 * koola://moments/<story|post>/<id> → MomentViewer
 *   - story link: `?authorId=<userId>` — required by the story player.
 *   - post link:  no author; MomentViewer resolves it from the post.
 *
 * Two paths (one real, one `alias`) rather than a single `:kind(story|post)`
 * placeholder: React Navigation would hand `kind` to the screen as a route param
 * nothing reads.
 */
import type { LinkingOptions } from '@react-navigation/native';
import type { RootStackParamList } from './types';

export type MomentsLinking = Pick<LinkingOptions<RootStackParamList>, 'prefixes' | 'config'>;

export const momentsLinking: MomentsLinking = {
  // The root pushes under `/chat`: a notification taps
  // `koola:///chat/moments/...`. The host form (`koola://moments/...`), which
  // is what an OS/browser hands over, stays supported.
  prefixes: ['koola:///chat', 'koola://'],
  config: {
    screens: {
      Main: {
        screens: {
          ChatTab: {
            screens: {
              MomentViewer: {
                path: 'moments/story/:startStoryId',
                // Same route, same params — a post link simply omits `authorId`.
                alias: [{ path: 'moments/post/:startStoryId' }],
                parse: { startStoryId: (v: string) => v },
              },
            },
          },
        },
      },
    },
  },
};

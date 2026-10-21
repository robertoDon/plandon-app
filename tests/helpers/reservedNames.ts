// Shared cases for the reserved display name (Equipe Don): the database rule (0007) and the sign-up mirror must agree.
// Invisible and look-alike characters are written as escapes: the source holds no raw invisibles.
export const RESERVED = [
  'Equipe Don',
  'equipe  don',
  'EquipeDon',
  'Minha Equipe Don oficial',
  'Equipe D\u{F4}n',
  'Equipe D\u{200B}on',
  'Equipe D\u{AD}on',
  'Equi\u{2060}pe Don',
  '\u{202E}Equipe Don',
  'Equipe \u{FF24}on',
  'Equipe Do\u{301}n',
  'Equipe D\u{1D173}on',
  'Equipe D\u{1BCA0}on',
  'Equipe D\u{3164}on',
  'Equipe D\u{93C}on',
  'Equipe D\u{FFA0}on',
  'Equipe D\u{115F}on',
  'Equipe D\u{600}on',
  'Equipe D\u{E31}on',
  'Equipe D\u{1D167}on',
  'Equipe D\u{E0041}on',
]
export const ALLOWED = ['Equipe Donizete', 'Equipe Done', 'Equipe Dom', 'Beto', 'Don', 'Equipe', 'Júlio Ponte']

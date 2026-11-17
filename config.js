// TTE site settings. Edit this one file; both pages read it.
// The "publishable" key is MEANT to be public. NEVER put a secret key (sb_secret_...) or the service_role key here.
window.TTE_CONFIG = {
  sbUrl: 'https://lzvhauteryvilkyqnwxa.supabase.co',
  sbKey: 'sb_publishable_DpqXIfC8m4C-YbgU5As41w_iN5Mc8So',
  // Where the "Send on WhatsApp" / "Send by email" buttons on the Sponsor page deliver pledges:
  whatsapp: '08077553611',
  email: 'rodonamemiboh@gmail.com',
  // Contact cards. They are shown ONLY on the home page, in this order. Add or remove cards here.
  // Each card can have: name, phone, whatsapp, email, address (leave out what you do not need).
  // Add  icons: true  to show phone / WhatsApp / email as tappable icons instead of text.
  contacts: [
    { name: 'For more enquiries', icons: true, phone: '08037505545', whatsapp: '08077553611', email: 'rodonamemiboh@gmail.com' },
    { name: 'Dixon Igoni', phone: '+1 (646) 361-3705', address: '3555 Olinville Ave, Apt 2A, Bronx, NY 10467' },
    { name: 'Igoni Igoni', phone: '+1 (414) 522-4763', address: '8703 W Cheyenne St, Milwaukee, WI 53224' }
  ]
};

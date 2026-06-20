-- Exécuter ce SQL dans l'éditeur SQL de Supabase (supabase.com > ton projet > SQL Editor)
-- Utilise CREATE TABLE IF NOT EXISTS pour éviter les erreurs si les tables existent déjà.

-- Table des shinobis (comptes)
CREATE TABLE IF NOT EXISTS shinobis (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nom text NOT NULL,
  prenom text NOT NULL,
  sceau text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Ajouter les colonnes role et grade si elles n'existent pas encore
ALTER TABLE shinobis ADD COLUMN IF NOT EXISTS role text DEFAULT 'membre';
ALTER TABLE shinobis ADD COLUMN IF NOT EXISTS grade text DEFAULT NULL;

-- Table des postes (prises de service)
CREATE TABLE IF NOT EXISTS postes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shinobi_id uuid REFERENCES shinobis(id) ON DELETE CASCADE,
  debut timestamptz NOT NULL,
  fin timestamptz,
  actif boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Colonne pour savoir qui a forcé la fin du poste (gérant)
ALTER TABLE postes ADD COLUMN IF NOT EXISTS force_par uuid REFERENCES shinobis(id);

-- Table des alertes (urgences et chirurgiens)
CREATE TABLE IF NOT EXISTS alertes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  type text NOT NULL CHECK (type IN ('urgence', 'chirurgien')),
  shinobi_id uuid REFERENCES shinobis(id) ON DELETE CASCADE,
  message text,
  actif boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Table des avertissements
CREATE TABLE IF NOT EXISTS avertissements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shinobi_id uuid REFERENCES shinobis(id) ON DELETE CASCADE,
  par_id uuid REFERENCES shinobis(id),
  raison text NOT NULL,
  actif boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Table de configuration (taux horaire en ryos)
CREATE TABLE IF NOT EXISTS config (
  cle text PRIMARY KEY,
  valeur text NOT NULL
);

-- Insérer le taux horaire par défaut (500 ryos/h) s'il n'existe pas
INSERT INTO config (cle, valeur) VALUES ('taux_horaire', '500')
ON CONFLICT (cle) DO NOTHING;

-- Table du canal de chat de la gérance
CREATE TABLE IF NOT EXISTS messages_gerance (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  auteur_id uuid REFERENCES shinobis(id) ON DELETE CASCADE,
  contenu text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Table des cours donnés par les membres
CREATE TABLE IF NOT EXISTS cours (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shinobi_id uuid REFERENCES shinobis(id) ON DELETE CASCADE,
  titre text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

-- Activer RLS
ALTER TABLE shinobis ENABLE ROW LEVEL SECURITY;
ALTER TABLE postes ENABLE ROW LEVEL SECURITY;
ALTER TABLE alertes ENABLE ROW LEVEL SECURITY;
ALTER TABLE avertissements ENABLE ROW LEVEL SECURITY;
ALTER TABLE config ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages_gerance ENABLE ROW LEVEL SECURITY;
ALTER TABLE cours ENABLE ROW LEVEL SECURITY;

-- DROP les policies existantes avant de les recréer
DROP POLICY IF EXISTS "Accès public shinobis" ON shinobis;
DROP POLICY IF EXISTS "Accès public postes" ON postes;
DROP POLICY IF EXISTS "Accès public alertes" ON alertes;
DROP POLICY IF EXISTS "Accès public avertissements" ON avertissements;
DROP POLICY IF EXISTS "Accès public config" ON config;
DROP POLICY IF EXISTS "Accès public messages_gerance" ON messages_gerance;
DROP POLICY IF EXISTS "Accès public cours" ON cours;

CREATE POLICY "Accès public shinobis" ON shinobis FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Accès public postes" ON postes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Accès public alertes" ON alertes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Accès public avertissements" ON avertissements FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Accès public config" ON config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Accès public messages_gerance" ON messages_gerance FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Accès public cours" ON cours FOR ALL USING (true) WITH CHECK (true);

-- Pour promouvoir quelqu'un en gérant (remplace le nom/prénom) :
-- UPDATE shinobis SET role = 'gerant' WHERE nom = 'Gaïa' AND prenom = 'Artel';
-- UPDATE shinobis SET role = 'co_gerant' WHERE nom = 'NomIci' AND prenom = 'PrénomIci';

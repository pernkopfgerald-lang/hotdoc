CMS-Made-Simple Modul für das Anzeigen von:
- Abteilungen bzw. Dienststellen
- Material & Geräte

SOLARYS Informatik GmbH
(c) 2008/10/26 
Fragen, Anregungen bitte an: support@solarys.com
________________________________________________

Installation:
1) Ordner Modules vom cmsmadesimple:
- modules/syBOSApiCMS
- modules/syBOSApiCMS/abteilung
- modules/syBOSApiCMS/classes
- modules/syBOSApiCMS/syBOSApiCMS.module.php

2) API-Key aus syBOS beschaffen.

3) Konfigurations-Dateien anpassen:
- syBOSApiCMS.config.php

4) In der CMS-Made-Simple Administration folgenden Menï¿½punkt:
"Extensions, Modules"
syBOSApiCMS installieren

5) Seiten im CMS-Made-Simple anlegen:
{cms_module module='syBOSApiCMS' action='listGeraet' perpage=10}
{cms_module module='syBOSApiCMS' action='listAbteilung' lkz='A' perpage=10}

Tutorial für CMS-Made-Simple Modul
http://wiki.cmsmadesimple.org/index.php/User_Handbook/Developers_Guide/Module_Tutorial




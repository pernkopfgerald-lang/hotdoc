<?php
class GeraetView {
	private $xmlFile = '';
	private $url = '';
	private $bilderlinktpl = '';
	private $perPage = 5;

	public function __construct($xmlFile, $url) {
		$this->xmlFile = $xmlFile;
		$this->url = $url;
	}

	private function getAttribute($objSimpleXml,$name){
		$attrs = $objSimpleXml->attributes();
		return @$attrs[$name];
	}

	/**
	 * Optional, definiert ein Template fuer die Bildanzeige 
	 * um das Medium-Bild z.B. in einem Popup zu laden oder mit einem Axjax Bilderviewer darzustellen
	 *
	 * @param string $str
	 */
	public function setBilderLinkTpl($str) {
		$this->bilderlinktpl = $str;
	}
	
	public function setPerPage($int) {
		$this->perPage = intval($int);
	}
	
	public function toHtml() {
		$perPage = $this->perPage;

		$xml = new SyXML($this->xmlFile);

		echo '<style>
.label {
font-size:11px;
}
.listNavigation {
padding-bottom:5px;
}
.rowab {
padding-top:5px;
padding-bottom:5px;
border-bottom:1px solid black;
}
</style>';

		if($xml->readXML() == false) {
			echo "Schnittstelle momentan nicht verf&uuml;gbar!";
		} else {
			$count = $xml->fetchSingleNode("number");
			$list = new SyList($this->url,$perPage);
			$list->setRowCount($count);
			$list->setActCount(@$_GET['x']);

			echo $list->getHtmlNavigation();

			$xml = new SyXML($this->xmlFile."&f=".$list->getFrom()."&a=".$list->getPerPage());
			$xml->readXML();

			$items = $xml->fetchNodes("item");

			echo "<table cellspacing=0 cellpading=0>";
			foreach ($items as $key=>$value) {
				echo "<tr>
				<td valign=top width=98% class=rowab>
				<table cellspacing=2>
					<tr>
						<td colspan=2 nowrap><b>$value->veroeffentltitel</b></td>
					</tr>	
					<tr>
						<td class=label>Klasse</td>
						<td>$value->klasse1 $value->klasse2 $value->klasse3</td>
					</tr>
					<tr>
						<td class=label>Dienststelle</td>
						<td>$value->abteilung</td>
					</tr>						
					<tr>
						<td class=label>Anschaffung</td>
						<td>$value->anschaffung</td>
					</tr>	
					<tr>
						<td class=label>Beschreibung</td>
						<td>".nl2br($value->veroeffentltxt)."</td>
					</tr>					
					<tr>
					<td class=label>Bilder</td>
					<td>".$this->lstBilder($value->images)."</td>																															
					</tr>
				</table>
				</td>
		</tr>";
			}
			echo "</table>".$list->getHtmlFooter();
		}
	}

	/**
 * Listet die Gruppen
 * z.B. Kommandant und Stellvertreter
 *
 * @param SimpleXMLElement $items
 * @return string
 */
	private function lstBilder($items) {
		$str = '';
		if ($items instanceof SimpleXMLElement) {
			foreach ($items as $value) { // item
				$i=0;
				foreach ($value as $v) { // item
					$i++;
					
					if (!empty($this->bilderlinktpl)) {
						$str .= $this->getParsedBilderLinkTpl($v->thumb,$v->medium);
					} else {
						$str .= "<img border=1 title='".$v->description."' src='".$v->thumb."'>&nbsp;";
					}
					if ($i > 2) {
						$str.="<br>";
						$i=0;
					}
				}
			}
		}
		return $str;
	}
	
	private function getParsedBilderLinkTpl($urlThumb,$urlMedium) {
		$t = $this->bilderlinktpl;
		$t = str_replace("{URL_THUMB}",$urlThumb,$t);
		$t = str_replace("{URL_MEDIUM}",$urlMedium,$t);
		return $t;
	}
}
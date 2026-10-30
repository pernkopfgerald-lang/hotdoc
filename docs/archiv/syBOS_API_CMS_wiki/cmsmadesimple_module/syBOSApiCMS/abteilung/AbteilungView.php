<?php
class AbteilungView {
	private $xmlFile = '';
	private $url = '';
	private $filterlkz = '';
	private $perPage = 5;

	public function __construct($xmlFile, $url) {
		$this->xmlFile = $xmlFile;
		$this->url = $url;
	}

	private function getAttribute($objSimpleXml,$name){
		$attrs = $objSimpleXml->attributes();
		return @$attrs[$name];
	}
	
	public function setPerPage($int) {
		$this->perPage = intval($int);
	}	

	/**
	 * einfache Verschluesslung fuer die es auch ein js zum entschluesseln gibt (UnPrajnaCrypt) kommt von den Mail-To Formularen:
	 * http://jumk.de/nospam
	 * http://www.tutorials.de/forum/javascript-ajax/247043-javascript-crypted-mail.html
	 *
	 * @param string $addi
	 * @return string
	 */
	private function CryptMailto($addi,$crypt)
	{

		if(!$crypt)
		{
			$addi=str_replace('@',' [at] ',$addi);
			$addi=str_replace('.',' [dot] ',$addi);
			return $addi;
		}
		$r='';
		$addi='mailto:'.$addi;
		for( $i=0; $i < strlen($addi); ++$i)
		{
			$n = ord($addi[$i]);
			if( $n >= 8364 )
			{
				$n = 128;
			}
			$r .= chr($n+1);
		}

		return $r;
	}

	public function setFilterLkz($str) {
		$this->filterlkz = $str;
	}

	public function toHtml() {
		$perPage = $this->perPage;

			$add = '';
			if (!empty($this->filterlkz)) {
				$add = "&lkz=$this->filterlkz";
			}		
		
		$xml = new SyXML($this->xmlFile.$add);

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
</style>
<script>
 function UnCryptMailto( s )
    {
        var n = 0;
        var r = "";
        for( var i = 0; i < s.length; i++)
        {
            n = s.charCodeAt( i );
            if( n >= 8364 )
            {
                n = 128;
            }
            r += String.fromCharCode( n - 1 );
        }
        return r;
    }

    function linkTo_UnCryptMailto( s )
    {
        location.href=UnCryptMailto( s );
    }

</script>';

		if($xml->readXML() == false) {
			echo "Schnittstelle momentan nicht verf&uuml;gbar!";
		} else {
			$count = $xml->fetchSingleNode("number");
			$list = new SyList($this->url,$perPage);
			$list->setRowCount($count);
			$list->setActCount(@$_GET['x']);

			echo $list->getHtmlNavigation();

			$xml = new SyXML($this->xmlFile."&f=".$list->getFrom()."&a=".$list->getPerPage().$add);
			$xml->readXML();

			$items = $xml->fetchNodes("item");

			echo "<table cellspacing=0 cellpading=0>";
			foreach ($items as $key=>$value) {
				echo "<tr>
				<td valign=top width=60% class=rowab>
				<table cellspacing=2>
					<tr>
						<td colspan=2 nowrap><b>$value->ABlang</b></td>
					</tr>	
					<tr>
						<td class=label>Strasse</td>
						<td>$value->ABstrasse</td>
					</tr>
					<tr>
						<td class=label>Ort/Plz</td>
						<td>$value->ABlkz $value->ABplz $value->ABort</td>
					</tr>		
					<tr>
						<td class=label>Telefon</td>
						<td>$value->ABtel</td>
					</tr>		
					<tr>
						<td class=label>Fax</td>
						<td>$value->ABfax</td>
					</tr>	
					<tr>
						<td class=label>E-Mail</td>
						<td>".(!empty($value->ABemail) ? "<a href=\"javascript:linkTo_UnCryptMailto('".$this->CryptMailto($value->ABemail,true)."')\">".$this->CryptMailto($value->ABemail,false)."</a>" : "&nbsp;")."</td>
					</tr>	
					<tr>
						<td class=label>Internet</td>
						<td>".(!empty($value->ABinternet) ? "<a target=_blank title='Internet' href='".(preg_match("/^http/",$value->ABinternet) ? $value->ABinternet : 'http://'.$value->ABinternet)."'>".$value->ABinternet."</a>" : "&nbsp;")."</td>
					</tr>
					<tr>
						<td class=label>Gr&uuml;ndung</td>
						<td>$value->ABgruendung</td>
					</tr>	
					".$this->lstGruppen($value->gruppe)."																															
				</table>
				</td>
				<td valign=top class=rowab>
					<table cellspacing=2>
					<tr>
						<td>".(!empty($value->image1->item->thumb) ? "<img border=0 alt='Logo' src=".$value->image1->item->thumb.">" : "&nbsp;")."</td>
					</tr>	
					<tr>
						<td>".(!empty($value->image2->item->thumb) ? "<img border=0 alt='Wappen' src=".$value->image2->item->thumb.">" : "&nbsp;")."</td>
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
	private function lstGruppen($items) {
		$str = '';
		if ($items instanceof SimpleXMLElement) {
			foreach ($items as $value) { // item
				foreach ($value as $v) {
					foreach ($v as $v2) { // pos
						$znf1 = @$v2->ADznf1;
						$vnf2 = @$v2->ADvnf2;
						$str .= "<tr><td class=label>".$this->getAttribute($v,"name")."</td><td>$vnf2 $znf1</td></tr>";
					}
				}
			}
		}
		return $str;
	}
}
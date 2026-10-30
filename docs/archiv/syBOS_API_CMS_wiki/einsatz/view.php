<?php
/**
 * syBOS Api-CMS Demo
 * 
 * @version 22.04.2008
 * @copyright SOLARYS Informatik GmbH
 */

header("Content-type: text/html; charset=UTF-8");  

include("../classes/SyXML.php");
include("config.php");

$xml = new SyXML($xmlFile."&thumbHeigth=230&id=".$_GET['id']);

if($xml->readXML() == false) {
	echo "Schnittstelle momentan nicht verf&uuml;gbar!";
} else {
	
	$item = $xml->fetchNodes("item");
	$value = $item[0];
	
	echo "<h1>Einsatz $value->von, $value->abteilung</h1>";
	
	echo "<table border=1 width=70%>";
		echo "<tr>
				<td>Datum von:</td><td>$value->von $value->vont</td>
			<tr>
			<tr>
				<td>bis:</td><td>$value->bis $value->bist</td>
			</tr>	
			<tr>
				<td>Feuerwehr</td><td>$value->abteilung</td>
			</tr>	
			<tr>
				<td>Einsatz-Ort</td><td>$value->einsatzort</td>
			</tr>
			<tr>
				<td>Ort-Kurz</td><td>$value->ortkurz</td>
			</tr>
			<tr>
				<td>Mannschaft</td><td>$value->mannschaft</td>
			</tr>	
			<tr>
				<td>Art</td><td>$value->art</td>
			</tr>					
			<tr>
				<td>Titel</td><td>$value->veroeffentltitel</td>
			</tr>
			<tr>
				<td colspan=2>$value->veroeffentltxt</td>
			</tr>						
		</tr>";
	echo "</table>";
	
	foreach ($value->images->item as $item=>$image) {
		echo "<a href='$image->medium' title='$image->description'>
				<img src='$image->thumb'/>
			</a><br>";
	}
}
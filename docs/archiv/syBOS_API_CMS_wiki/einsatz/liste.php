<?php
/**
 * syBOS Api-CMS Demo
 * 
 * @version 22.04.2008
 * @copyright SOLARYS Informatik GmbH
 */

header("Content-type: text/html; charset=UTF-8");  

include("../classes/SyXML.php");
include("../classes/SyList.php");
include("config.php");

$perPage = 5;

$xml = new SyXML($xmlFile);

echo "<h1>Die letzten Eins&auml;tze, erfasst und ver&ouml;ffentlicht in syBOS</h1>";

if($xml->readXML() == false) {
	echo "Schnittstelle momentan nicht verf&uuml;gbar!";
} else {

	$count = $xml->fetchSingleNode("number");

	$list = new SyList("?page=meineCMSEinsatzSeite",$perPage);
	$list->setRowCount($count);
	$list->setActCount(@$_GET['x']);

	echo $list->getHtmlNavigation();
	$xmlFile = $xmlFile."&f=".$list->getFrom()."&a=".$list->getPerPage();
	$xml = new SyXML($xmlFile);
	$xml->readXML();

	$items = $xml->fetchNodes("item");

	echo "<table border=1>";
	foreach ($items as $key=>$value) {
		echo "<tr>
			<td><a href='view.php?id=$value->id'>$value->von</a></td>
			<td>$value->vont</td>
			<td>$value->bis</td>
			<td>$value->bist</td>			
			<td>$value->abteilung</td>
			<td>$value->einsatzort</td>
			<td>$value->ortkurz</td>
			<td>$value->veroeffentltitel</td>
		</tr>";
	}
	echo "</table>";
}